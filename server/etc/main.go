package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Find the project root directory containing package.json
func findRootDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	dir, _ = os.Getwd()
	return dir
}

func main() {
	// 1. Load env and resolve directories
	LoadEnv()
	rootDir := findRootDir()
	storageDir = filepath.Join(rootDir, "storage")
	os.MkdirAll(storageDir, 0755)

	// 2. Initialize Supabase PostgREST client
	InitSupabase()

	// 3. Seed default folders
	seedDefaultFolders()

	// 4. Set up HTTP Router
	mux := http.NewServeMux()

	// Auth routes
	mux.HandleFunc("POST /api/auth/register", RegisterHandler)
	mux.HandleFunc("POST /api/auth/login", LoginHandler)
	mux.HandleFunc("GET /api/auth/me", MeHandler)

	// File routes
	mux.HandleFunc("GET /api/files", FilesHandler)
	mux.HandleFunc("POST /api/upload-chunk", UploadChunkHandler)
	mux.HandleFunc("POST /api/files/{id}/favorite", FavoriteHandler)
	mux.HandleFunc("GET /api/favorites", FavoritesHandler)
	mux.HandleFunc("DELETE /api/files/{id}", SoftDeleteFileHandler)
	mux.HandleFunc("GET /api/trash", TrashHandler)
	mux.HandleFunc("POST /api/files/{id}/restore", RestoreFileHandler)
	mux.HandleFunc("DELETE /api/files/{id}/permanent", PermanentDeleteFileHandler)

	// Folder routes
	mux.HandleFunc("GET /api/folders", FoldersHandler)
	mux.HandleFunc("POST /api/folders", CreateFolderHandler)
	mux.HandleFunc("DELETE /api/folders/{id}", DeleteFolderHandler)

	// Share routes
	mux.HandleFunc("POST /api/shares", CreateShareHandler)
	mux.HandleFunc("GET /api/shared", SharedWithMeHandler)
	mux.HandleFunc("GET /api/shares/public/{token}", GetPublicShareHandler)
	mux.HandleFunc("GET /api/shares", GetSharesHandler)
	mux.HandleFunc("DELETE /api/shares/{id}", DeleteShareHandler)

	// Notifications route
	mux.HandleFunc("GET /api/notifications", NotificationsHandler)

	// Stats route
	mux.HandleFunc("GET /api/storage-stats", StorageStatsHandler)

	// Serve static files from storage directory
	fileServer := http.FileServer(http.Dir(storageDir))
	mux.Handle("GET /files/", http.StripPrefix("/files/", fileServer))

	// CORS wrapper
	corsHandler := corsMiddleware(mux)

	// 5. Start background worker for trash purges
	go startPurgeTicker()

	// 6. Start Server
	port := GetEnv("PORT_BACKEND", "8889")
	fmt.Printf("Syncnu Go backend running at http://localhost:%s\n", port)
	err := http.ListenAndServe(":"+port, corsHandler)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}

// CORS Middleware to allow requests from Web client and Tauri Webview
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Seeding standard system default folders
func seedDefaultFolders() {
	if supabase == nil || supabase.URL == "" {
		return
	}

	systemFolderNames := []string{"Dokumen", "Gambar", "Video", "Musik"}

	// Check existing default folders in DB
	var existing []Folder
	err := supabase.Select("folders", "name", map[string]string{
		"owner": "eq.system",
	}, &existing)

	if err != nil {
		fmt.Printf("Could not check existing default folders: %v\n", err)
		return
	}

	existingMap := make(map[string]bool)
	for _, f := range existing {
		existingMap[f.Name] = true
	}

	// Insert missing ones
	for _, name := range systemFolderNames {
		// Ensure physical folder exists on disk
		folderPath := filepath.Join(storageDir, name)
		os.MkdirAll(folderPath, 0755)

		if !existingMap[name] {
			newFolder := Folder{
				Name:  name,
				Owner: "system",
			}
			var inserted []Folder
			err = supabase.Insert("folders", []Folder{newFolder}, &inserted)
			if err != nil {
				fmt.Printf("Failed to seed folder \"%s\": %v\n", name, err)
			} else {
				fmt.Printf("Seeded default folder: %s\n", name)
			}
		}
	}
}

// Background ticker to purge expired files
func startPurgeTicker() {
	// Run initially on startup
	purgeExpiredTrash()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		purgeExpiredTrash()
	}
}

func purgeExpiredTrash() {
	if supabase == nil || supabase.URL == "" {
		return
	}

	// Expired: deleted_at < now() - 7 days
	expiryDate := time.Now().Add(-7 * 24 * time.Hour).Format(time.RFC3339)

	var expiredFiles []File
	err := supabase.Select("files", "id,path,name", map[string]string{
		"deleted_at": "lt." + expiryDate,
	}, &expiredFiles)

	if err != nil || len(expiredFiles) == 0 {
		return
	}

	for _, file := range expiredFiles {
		// 1. Delete physical file from disk
		cleanedPath := strings.TrimPrefix(file.Path, "/files/")
		absPath := filepath.Join(storageDir, cleanedPath)
		if _, err := os.Stat(absPath); err == nil {
			os.Remove(absPath)
		}

		// 2. Delete file record from DB
		var deleted []File
		supabase.Delete("files", map[string]string{"id": "eq." + file.ID}, &deleted)

		fmt.Printf("Purged expired trash file: %s (ID: %s)\n", file.Name, file.ID)
	}
}

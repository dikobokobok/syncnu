package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// storageDir global variable
var storageDir string

type RegisterReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type FolderReq struct {
	Name  string `json:"name"`
	Owner string `json:"owner"`
}

// ─── Auth Handlers ───────────────────────────────────────────────────────────

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req RegisterReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request JSON"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"Email dan password wajib diisi"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, `{"error":"Password minimal 6 karakter"}`, http.StatusBadRequest)
		return
	}

	// Check existing user
	var existing []User
	err := supabase.Select("users", "id", map[string]string{"email": "eq." + strings.ToLower(req.Email)}, &existing)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if len(existing) > 0 {
		http.Error(w, `{"error":"Email sudah terdaftar"}`, http.StatusConflict)
		return
	}

	hashedPassword, err := HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"Failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	displayName := req.Name
	if displayName == "" {
		parts := strings.Split(req.Email, "@")
		displayName = parts[0]
	}

	newUser := User{
		Email:    strings.ToLower(req.Email),
		Password: hashedPassword,
		Name:     displayName,
	}

	var inserted []User
	err = supabase.Insert("users", []User{newUser}, &inserted)
	if err != nil || len(inserted) == 0 {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to create account: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Akun berhasil dibuat",
		"user": map[string]interface{}{
			"id":         inserted[0].ID,
			"email":      inserted[0].Email,
			"name":       inserted[0].Name,
			"created_at": inserted[0].CreatedAt,
		},
	})
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req LoginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request JSON"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"Email dan password wajib diisi"}`, http.StatusBadRequest)
		return
	}

	var users []User
	err := supabase.Select("users", "id,email,name,password", map[string]string{"email": "eq." + strings.ToLower(req.Email)}, &users)
	if err != nil || len(users) == 0 {
		http.Error(w, `{"error":"Email atau password salah"}`, http.StatusUnauthorized)
		return
	}

	user := users[0]
	if !CheckPasswordHash(req.Password, user.Password) {
		http.Error(w, `{"error":"Email atau password salah"}`, http.StatusUnauthorized)
		return
	}

	token, err := GenerateJWT(user.ID, user.Email, user.Name)
	if err != nil {
		http.Error(w, `{"error":"Failed to sign JWT"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user": map[string]string{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
		},
	})
}

func MeHandler(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, `{"error":"Token tidak ditemukan"}`, http.StatusUnauthorized)
		return
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := ValidateJWT(token)
	if err != nil {
		http.Error(w, `{"error":"Token tidak valid atau sudah kadaluarsa"}`, http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]string{
			"id":    claims.ID,
			"email": claims.Email,
			"name":  claims.Name,
		},
	})
}

// ─── File Handlers ───────────────────────────────────────────────────────────

func FilesHandler(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner")

	filters := map[string]string{
		"deleted_at": "is.null",
		"order":      "created_at.desc",
	}
	if owner != "" {
		filters["owner"] = "eq." + owner
	}

	var files []File
	err := supabase.Select("files", "*", filters, &files)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Make sure we return an empty array [] instead of null if files is empty
	if files == nil {
		files = []File{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func FavoriteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing file ID"}`, http.StatusBadRequest)
		return
	}

	var files []File
	err := supabase.Select("files", "is_favorited", map[string]string{"id": "eq." + id}, &files)
	if err != nil || len(files) == 0 {
		http.Error(w, `{"error":"File tidak ditemukan"}`, http.StatusNotFound)
		return
	}

	newFav := !files[0].IsFavorite

	var updated []File
	err = supabase.Update("files", map[string]string{"id": "eq." + id}, map[string]interface{}{
		"is_favorited": newFav,
		"modified_at":  time.Now().Format(time.RFC3339),
	}, &updated)

	if err != nil || len(updated) == 0 {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to update favorite: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Favorit diperbarui",
		"file":    updated[0],
	})
}

func FavoritesHandler(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner")

	filters := map[string]string{
		"is_favorited": "eq.true",
		"deleted_at":   "is.null",
		"order":        "modified_at.desc",
	}
	if owner != "" {
		filters["owner"] = "eq." + owner
	}

	var files []File
	err := supabase.Select("files", "*", filters, &files)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []File{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func SoftDeleteFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing file ID"}`, http.StatusBadRequest)
		return
	}

	deletedAt := time.Now().Format(time.RFC3339)
	var updated []File
	err := supabase.Update("files", map[string]string{"id": "eq." + id}, map[string]interface{}{
		"deleted_at": deletedAt,
	}, &updated)

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "File moved to trash"})
}

func TrashHandler(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner")

	// Filter files: deleted_at is not null and deleted_at > now - 7 days
	expiryDate := time.Now().Add(-7 * 24 * time.Hour).Format(time.RFC3339)
	filters := map[string]string{
		"and":   fmt.Sprintf("(deleted_at.not.is.null,deleted_at.gt.%s)", expiryDate),
		"order": "deleted_at.desc",
	}
	if owner != "" {
		filters["owner"] = "eq." + owner
	}

	var files []File
	err := supabase.Select("files", "*", filters, &files)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []File{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func RestoreFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing file ID"}`, http.StatusBadRequest)
		return
	}

	var updated []File
	err := supabase.Update("files", map[string]string{"id": "eq." + id}, map[string]interface{}{
		"deleted_at": nil,
	}, &updated)

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "File restored successfully"})
}

func PermanentDeleteFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing file ID"}`, http.StatusBadRequest)
		return
	}

	var files []File
	err := supabase.Select("files", "path", map[string]string{"id": "eq." + id}, &files)
	if err != nil || len(files) == 0 {
		http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
		return
	}

	servingPath := files[0].Path

	// Delete from DB first
	var deleted []File
	err = supabase.Delete("files", map[string]string{"id": "eq." + id}, &deleted)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Delete physical file
	cleanedPath := strings.TrimPrefix(servingPath, "/files/")
	absPath := filepath.Join(storageDir, cleanedPath)
	if _, err := os.Stat(absPath); err == nil {
		os.Remove(absPath)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "File permanently deleted"})
}

// ─── Folder Handlers ─────────────────────────────────────────────────────────

func FoldersHandler(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner")

	filters := map[string]string{
		"order": "created_at.asc",
	}
	if owner != "" {
		filters["or"] = fmt.Sprintf("(owner.eq.%s,owner.eq.system)", owner)
	}

	var folders []Folder
	err := supabase.Select("folders", "*", filters, &folders)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if folders == nil {
		folders = []Folder{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folders)
}

func CreateFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req FolderReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request JSON"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Owner == "" {
		http.Error(w, `{"error":"Name and owner are required"}`, http.StatusBadRequest)
		return
	}

	// Check if folder exists
	reg := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	folderSlug := strings.TrimSpace(reg.ReplaceAllString(req.Name, "_"))
	destDir := filepath.Join(storageDir, folderSlug)

	err := os.MkdirAll(destDir, 0755)
	if err != nil {
		http.Error(w, `{"error":"Failed to create physical directory"}`, http.StatusInternalServerError)
		return
	}

	newFolder := Folder{
		Name:  req.Name,
		Owner: req.Owner,
	}

	var inserted []Folder
	err = supabase.Insert("folders", []Folder{newFolder}, &inserted)
	if err != nil || len(inserted) == 0 {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inserted[0])
}

func DeleteFolderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing folder ID"}`, http.StatusBadRequest)
		return
	}

	var folders []Folder
	err := supabase.Select("folders", "name", map[string]string{"id": "eq." + id}, &folders)
	if err != nil || len(folders) == 0 {
		http.Error(w, `{"error":"Folder not found"}`, http.StatusNotFound)
		return
	}

	folderName := folders[0].Name
	systemFolders := []string{"Dokumen", "Gambar", "Video", "Musik"}
	for _, sf := range systemFolders {
		if sf == folderName {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("Folder \"%s\" adalah folder default dan tidak dapat dihapus.", folderName),
			})
			return
		}
	}

	// Soft-delete all active files in this folder
	deletedAt := time.Now().Format(time.RFC3339)
	var activeFilesInFolder []File
	err = supabase.Select("files", "id", map[string]string{
		"folder_id":  "eq." + id,
		"deleted_at": "is.null",
	}, &activeFilesInFolder)

	var filesMoved int = 0
	if err == nil && len(activeFilesInFolder) > 0 {
		var updatedFiles []File
		supabase.Update("files", map[string]string{
			"folder_id":  "eq." + id,
			"deleted_at": "is.null",
		}, map[string]interface{}{
			"deleted_at": deletedAt,
		}, &updatedFiles)
		filesMoved = len(updatedFiles)
	}

	// Remove physical folder from disk
	reg := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	folderSlug := strings.TrimSpace(reg.ReplaceAllString(folderName, "_"))
	folderPath := filepath.Join(storageDir, folderSlug)
	if _, err := os.Stat(folderPath); err == nil {
		os.RemoveAll(folderPath)
	}

	// Delete folder from DB
	var deleted []Folder
	err = supabase.Delete("folders", map[string]string{"id": "eq." + id}, &deleted)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Failed to delete folder from database: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":            "Folder deleted successfully",
		"filesMovedToTrash": filesMoved,
	})
}

// ─── Stats Handlers ──────────────────────────────────────────────────────────

func StorageStatsHandler(w http.ResponseWriter, r *http.Request) {
	used := GetDirSize(storageDir)

	total, free, err := GetDiskSpace(storageDir)
	if err != nil {
		// Fallback to STORAGE_QUOTA_GB
		quotaGBStr := GetEnv("STORAGE_QUOTA_GB", "100")
		quotaGB, _ := strconv.ParseInt(quotaGBStr, 10, 64)
		total = uint64(quotaGB * 1024 * 1024 * 1024)
		free = 0
		if total > uint64(used) {
			free = total - uint64(used)
		}
	}

	// Formatting helper
	fmtBytes := func(b uint64) string {
		if b == 0 {
			return "0 B"
		}
		k := uint64(1024)
		sizes := []string{"B", "KB", "MB", "GB", "TB"}
		i := 0
		val := float64(b)
		for val >= 1024 && i < len(sizes)-1 {
			val /= float64(k)
			i++
		}
		return fmt.Sprintf("%.1f %s", val, sizes[i])
	}

	percentVal := float64(used) / float64(total) * 100

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"used":           used,
		"total":          total,
		"free":           free,
		"usedFormatted":  fmtBytes(uint64(used)),
		"totalFormatted": fmtBytes(total),
		"freeFormatted":  fmtBytes(free),
		"percent":        fmt.Sprintf("%.2f", percentVal),
	})
}

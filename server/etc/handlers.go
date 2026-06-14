package main

import (
	"crypto/rand"
	"encoding/hex"
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
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginReq struct {
	Username string `json:"username"`
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

	if req.Username == "" || req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"Username, email, dan password wajib diisi"}`, http.StatusBadRequest)
		return
	}

	// Validate username format
	usernameRegexp := regexp.MustCompile(`^[a-zA-Z0-9_-]{3,30}$`)
	if !usernameRegexp.MatchString(req.Username) {
		http.Error(w, `{"error":"Username harus 3-30 karakter, hanya huruf, angka, underscore, atau strip"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, `{"error":"Password minimal 6 karakter"}`, http.StatusBadRequest)
		return
	}

	// Check existing username
	var existingUser []User
	err := supabase.Select("users", "id", map[string]string{"username": "eq." + strings.ToLower(req.Username)}, &existingUser)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	if len(existingUser) > 0 {
		http.Error(w, `{"error":"Username sudah terdaftar"}`, http.StatusConflict)
		return
	}

	// Check existing email
	var existingEmail []User
	err = supabase.Select("users", "id", map[string]string{"email": "eq." + strings.ToLower(req.Email)}, &existingEmail)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	if len(existingEmail) > 0 {
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
		displayName = req.Username
	}

	newUser := User{
		Username: strings.ToLower(req.Username),
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
			"username":   inserted[0].Username,
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

	if req.Username == "" || req.Password == "" {
		http.Error(w, `{"error":"Username dan password wajib diisi"}`, http.StatusBadRequest)
		return
	}

	var users []User
	err := supabase.Select("users", "id,username,email,name,password", map[string]string{"username": "eq." + strings.ToLower(req.Username)}, &users)
	if err != nil || len(users) == 0 {
		http.Error(w, `{"error":"Username atau password salah"}`, http.StatusUnauthorized)
		return
	}

	user := users[0]
	if !CheckPasswordHash(req.Password, user.Password) {
		http.Error(w, `{"error":"Username atau password salah"}`, http.StatusUnauthorized)
		return
	}

	token, err := GenerateJWT(user.ID, user.Username, user.Email, user.Name)
	if err != nil {
		http.Error(w, `{"error":"Failed to sign JWT"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user": map[string]string{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"name":     user.Name,
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
			"id":       claims.ID,
			"username": claims.Username,
			"email":    claims.Email,
			"name":     claims.Name,
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

// ─── Share Handlers ──────────────────────────────────────────────────────────

type CreateShareReq struct {
	FileID    string `json:"file_id"`
	FolderID  string `json:"folder_id"`
	ShareType string `json:"share_type"` // "link" or "email"
	SharedTo  string `json:"shared_to"`  // recipient email
}

func getUserFromAuth(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", fmt.Errorf("token otorisasi tidak ditemukan")
	}
	token := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := ValidateJWT(token)
	if err != nil {
		return "", err
	}
	return claims.Email, nil
}

func GenerateRandomToken(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

func CreateShareHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	email, err := getUserFromAuth(r)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Unauthorized: %s"}`, err.Error()), http.StatusUnauthorized)
		return
	}

	var req CreateShareReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request JSON"}`, http.StatusBadRequest)
		return
	}

	if req.FileID == "" && req.FolderID == "" {
		http.Error(w, `{"error":"file_id or folder_id is required"}`, http.StatusBadRequest)
		return
	}

	if req.ShareType != "link" && req.ShareType != "email" {
		http.Error(w, `{"error":"Invalid share_type"}`, http.StatusBadRequest)
		return
	}

	var tokenVal *string
	if req.ShareType == "link" {
		t := GenerateRandomToken(16)
		tokenVal = &t
	}

	var sharedToVal *string
	if req.ShareType == "email" {
		if req.SharedTo == "" {
			http.Error(w, `{"error":"shared_to email is required for email shares"}`, http.StatusBadRequest)
			return
		}
		st := strings.ToLower(req.SharedTo)
		sharedToVal = &st
	}

	newShare := Share{
		SharedBy:  email,
		ShareType: req.ShareType,
	}

	if req.FileID != "" {
		newShare.FileID = &req.FileID
	}
	if req.FolderID != "" {
		newShare.FolderID = &req.FolderID
	}
	if tokenVal != nil {
		newShare.Token = tokenVal
	}
	if sharedToVal != nil {
		newShare.SharedTo = sharedToVal
	}

	var inserted []Share
	err = supabase.Insert("shares", []Share{newShare}, &inserted)
	if err != nil || len(inserted) == 0 {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inserted[0])
}

func SharedWithMeHandler(w http.ResponseWriter, r *http.Request) {
	email, err := getUserFromAuth(r)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Unauthorized: %s"}`, err.Error()), http.StatusUnauthorized)
		return
	}

	var shares []Share
	err = supabase.Select("shares", "*", map[string]string{
		"shared_to": "eq." + strings.ToLower(email),
	}, &shares)

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	type SharedItem struct {
		ShareID   string     `json:"share_id"`
		ShareType string     `json:"share_type"`
		SharedBy  string     `json:"shared_by"`
		CreatedAt *time.Time `json:"created_at"`
		Type      string     `json:"type"` // "file" or "folder"
		File      *File      `json:"file,omitempty"`
		Folder    *Folder    `json:"folder,omitempty"`
		Files     []File     `json:"files,omitempty"` // If folder, files inside it
	}

	var items []SharedItem = []SharedItem{}

	for _, s := range shares {
		if s.FileID != nil {
			var files []File
			err = supabase.Select("files", "*", map[string]string{"id": "eq." + *s.FileID}, &files)
			if err == nil && len(files) > 0 {
				items = append(items, SharedItem{
					ShareID:   s.ID,
					ShareType: s.ShareType,
					SharedBy:  s.SharedBy,
					CreatedAt: s.CreatedAt,
					Type:      "file",
					File:      &files[0],
				})
			}
		} else if s.FolderID != nil {
			var folders []Folder
			err = supabase.Select("folders", "*", map[string]string{"id": "eq." + *s.FolderID}, &folders)
			if err == nil && len(folders) > 0 {
				var folderFiles []File
				supabase.Select("files", "*", map[string]string{
					"folder_id":  "eq." + *s.FolderID,
					"deleted_at": "is.null",
				}, &folderFiles)
				if folderFiles == nil {
					folderFiles = []File{}
				}
				items = append(items, SharedItem{
					ShareID:   s.ID,
					ShareType: s.ShareType,
					SharedBy:  s.SharedBy,
					CreatedAt: s.CreatedAt,
					Type:      "folder",
					Folder:    &folders[0],
					Files:     folderFiles,
				})
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func GetPublicShareHandler(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, `{"error":"Token is required"}`, http.StatusBadRequest)
		return
	}

	var shares []Share
	err := supabase.Select("shares", "*", map[string]string{
		"token": "eq." + token,
	}, &shares)

	if err != nil || len(shares) == 0 {
		http.Error(w, `{"error":"Share not found"}`, http.StatusNotFound)
		return
	}

	share := shares[0]

	type PublicShareResponse struct {
		ShareID   string     `json:"share_id"`
		SharedBy  string     `json:"shared_by"`
		CreatedAt *time.Time `json:"created_at"`
		Type      string     `json:"type"` // "file" or "folder"
		File      *File      `json:"file,omitempty"`
		Folder    *Folder    `json:"folder,omitempty"`
		Files     []File     `json:"files,omitempty"` // If folder, files inside it
	}

	resp := PublicShareResponse{
		ShareID:   share.ID,
		SharedBy:  share.SharedBy,
		CreatedAt: share.CreatedAt,
	}

	if share.FileID != nil {
		var files []File
		err = supabase.Select("files", "*", map[string]string{"id": "eq." + *share.FileID}, &files)
		if err != nil || len(files) == 0 {
			http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
			return
		}
		resp.Type = "file"
		resp.File = &files[0]
	} else if share.FolderID != nil {
		var folders []Folder
		err = supabase.Select("folders", "*", map[string]string{"id": "eq." + *share.FolderID}, &folders)
		if err != nil || len(folders) == 0 {
			http.Error(w, `{"error":"Folder not found"}`, http.StatusNotFound)
			return
		}
		resp.Type = "folder"
		resp.Folder = &folders[0]

		var folderFiles []File
		err = supabase.Select("files", "*", map[string]string{
			"folder_id":  "eq." + *share.FolderID,
			"deleted_at": "is.null",
		}, &folderFiles)
		if err == nil {
			resp.Files = folderFiles
		} else {
			resp.Files = []File{}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetSharesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	email, err := getUserFromAuth(r)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Unauthorized: %s"}`, err.Error()), http.StatusUnauthorized)
		return
	}

	fileID := r.URL.Query().Get("file_id")
	folderID := r.URL.Query().Get("folder_id")

	if fileID == "" && folderID == "" {
		http.Error(w, `{"error":"file_id or folder_id parameter is required"}`, http.StatusBadRequest)
		return
	}

	filters := map[string]string{
		"shared_by": "eq." + email,
	}
	if fileID != "" {
		filters["file_id"] = "eq." + fileID
	} else {
		filters["folder_id"] = "eq." + folderID
	}

	var shares []Share
	err = supabase.Select("shares", "*", filters, &shares)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	if shares == nil {
		shares = []Share{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}

func NotificationsHandler(w http.ResponseWriter, r *http.Request) {
	email, err := getUserFromAuth(r)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Unauthorized: %s"}`, err.Error()), http.StatusUnauthorized)
		return
	}

	filters := map[string]string{
		"shared_to": "eq." + strings.ToLower(email),
		"order":     "created_at.desc",
		"limit":     "20",
	}

	sinceParam := r.URL.Query().Get("since")
	if sinceParam != "" {
		if _, parseErr := time.Parse(time.RFC3339, sinceParam); parseErr == nil {
			filters["created_at"] = "gt." + sinceParam
		}
	}

	var shares []Share
	err = supabase.Select("shares", "*", filters, &shares)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	type Notification struct {
		ID        string     `json:"id"`
		Type      string     `json:"type"`
		Message   string     `json:"message"`
		SharedBy  string     `json:"shared_by"`
		ItemName  string     `json:"item_name"`
		ItemType  string     `json:"item_type"`
		CreatedAt *time.Time `json:"created_at"`
	}

	notifications := []Notification{}

	for _, s := range shares {
		var itemName string
		var itemType string

		if s.FileID != nil {
			var files []File
			if err := supabase.Select("files", "name", map[string]string{"id": "eq." + *s.FileID}, &files); err == nil && len(files) > 0 {
				itemName = files[0].Name
			}
			itemType = "file"
		} else if s.FolderID != nil {
			var folders []Folder
			if err := supabase.Select("folders", "name", map[string]string{"id": "eq." + *s.FolderID}, &folders); err == nil && len(folders) > 0 {
				itemName = folders[0].Name
			}
			itemType = "folder"
		}

		if itemName == "" || itemType == "" {
			continue
		}

		notifications = append(notifications, Notification{
			ID:        s.ID,
			Type:      "share",
			Message:   "shared a " + itemType + " with you",
			SharedBy:  s.SharedBy,
			ItemName:  itemName,
			ItemType:  itemType,
			CreatedAt: s.CreatedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notifications)
}

func DeleteShareHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	email, err := getUserFromAuth(r)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Unauthorized: %s"}`, err.Error()), http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"Missing share ID"}`, http.StatusBadRequest)
		return
	}

	// First verify ownership of this share record
	var shares []Share
	err = supabase.Select("shares", "*", map[string]string{
		"id":        "eq." + id,
		"shared_by": "eq." + email,
	}, &shares)
	if err != nil || len(shares) == 0 {
		http.Error(w, `{"error":"Share not found or access denied"}`, http.StatusNotFound)
		return
	}

	var deleted []Share
	err = supabase.Delete("shares", map[string]string{
		"id": "eq." + id,
	}, &deleted)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database error: %v"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Folder restriction representation
type FolderRestriction struct {
	Label       string
	Accept      []string
	MimePattern *regexp.Regexp
}

var DEFAULT_FOLDERS = map[string]FolderRestriction{
	"Dokumen": {
		Label: "Dokumen",
		Accept: []string{
			".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
			".rtf", ".odt", ".ods", ".odp", ".csv",
			".txt", ".md", ".mdx", ".json", ".xml", ".yaml", ".yml",
			".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx",
			".py", ".java", ".php", ".go", ".rs", ".sh", ".bash",
			".sql", ".env", ".log", ".ini", ".toml", ".conf",
			".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz",
		},
		MimePattern: regexp.MustCompile(`(?i)^(application/(pdf|msword|vnd\.|zip|x-zip|x-rar|x-7z|x-tar|gzip|x-bzip|x-bzip2|x-gzip|octet-stream|json|xml|javascript|x-sh|x-python|x-java|x-php|x-ruby|x-perl|x-httpd-php|typescript|x-typescript|sql|x-sql|toml|x-toml)|text/)`),
	},
	"Gambar": {
		Label: "Gambar",
		Accept: []string{
			".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif",
			".svg", ".eps", ".ai",
			".raw", ".cr2", ".nef", ".arw", ".dng", ".tiff", ".tif", ".heic", ".heif",
			".psd", ".xcf", ".bmp", ".ico", ".fig", ".sketch",
		},
		MimePattern: regexp.MustCompile(`(?i)^image/`),
	},
	"Video": {
		Label: "Video",
		Accept: []string{
			".mp4", ".webm", ".mkv",
			".mov", ".avi", ".wmv", ".flv", ".f4v",
			".mxf", ".mts", ".m2ts",
			".3gp", ".vob", ".mpg", ".mpeg", ".m4v",
		},
		MimePattern: regexp.MustCompile(`(?i)^video/`),
	},
	"Musik": {
		Label: "Musik",
		Accept: []string{
			".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus",
			".aiff", ".alac", ".mid", ".midi",
		},
		MimePattern: regexp.MustCompile(`(?i)^audio/`),
	},
}

// UploadChunkHandler handles chunked file uploading
func UploadChunkHandler(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (up to 10MB memory)
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		http.Error(w, `{"error":"Unable to parse form"}`, http.StatusBadRequest)
		return
	}

	uploadID := r.FormValue("upload_id")
	chunkIndexStr := r.FormValue("chunk_index")
	totalChunksStr := r.FormValue("total_chunks")
	fileName := r.FormValue("file_name")
	fileSizeStr := r.FormValue("file_size")
	owner := r.FormValue("owner")
	folderID := r.FormValue("folder_id")
	folderName := r.FormValue("folder_name")

	if uploadID == "" || chunkIndexStr == "" || totalChunksStr == "" || fileName == "" || fileSizeStr == "" || owner == "" {
		http.Error(w, `{"error":"Missing required fields"}`, http.StatusBadRequest)
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	totalChunks, err := strconv.Atoi(totalChunksStr)
	fileSize, err := strconv.ParseInt(fileSizeStr, 10, 64)
	if err != nil || chunkIndex < 0 || totalChunks <= 0 {
		http.Error(w, `{"error":"Invalid parameters"}`, http.StatusBadRequest)
		return
	}

	chunkFile, _, err := r.FormFile("chunk")
	if err != nil {
		http.Error(w, `{"error":"Missing chunk file"}`, http.StatusBadRequest)
		return
	}
	defer chunkFile.Close()

	// 1. Resolve folder and validate MIME type constraints (only on the first chunk)
	var targetFolderID string = folderID
	var resolvedFolderName string = folderName

	if chunkIndex == 0 {
		if folderName != "" && folderID == "" {
			// Ensure folder exists
			fID, err := ensureFolderExists(folderName, owner)
			if err == nil && fID != "" {
				targetFolderID = fID
			}
		}

		// Perform MIME checks for system folders
		if targetFolderID != "" {
			var folders []Folder
			err := supabase.Select("folders", "name", map[string]string{"id": "eq." + targetFolderID}, &folders)
			if err == nil && len(folders) > 0 {
				folderNameDb := folders[0].Name
				resolvedFolderName = folderNameDb
				if restriction, ok := DEFAULT_FOLDERS[folderNameDb]; ok {
					fileExt := strings.ToLower(filepath.Ext(fileName))
					// Guess mimetype from extension
					mimetype := mime.TypeByExtension(fileExt)
					if mimetype == "" {
						mimetype = "application/octet-stream"
					}

					mimeOk := restriction.MimePattern.MatchString(mimetype)
					extOk := false
					for _, acceptExt := range restriction.Accept {
						if acceptExt == fileExt {
							extOk = true
							break
						}
					}

					if !mimeOk && !extOk {
						errMsg := fmt.Sprintf("Folder \"%s\" hanya menerima file: %s", folderNameDb, strings.Join(restriction.Accept, ", "))
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusBadRequest)
						json.NewEncoder(w).Encode(map[string]string{
							"error": errMsg,
							"code":  "MIME_RESTRICTED",
						})
						return
					}
				}
			}
		}
	}

	// 2. Save chunk to temporary directory
	tempDir := filepath.Join(storageDir, "temp", uploadID)
	err = os.MkdirAll(tempDir, 0755)
	if err != nil {
		http.Error(w, `{"error":"Failed to create temp directory"}`, http.StatusInternalServerError)
		return
	}

	chunkPath := filepath.Join(tempDir, strconv.Itoa(chunkIndex))
	out, err := os.Create(chunkPath)
	if err != nil {
		http.Error(w, `{"error":"Failed to save chunk"}`, http.StatusInternalServerError)
		return
	}
	defer out.Close()

	_, err = io.Copy(out, chunkFile)
	if err != nil {
		http.Error(w, `{"error":"Failed to write chunk"}`, http.StatusInternalServerError)
		return
	}

	// 3. Verify if all chunks are uploaded
	allFinished := true
	for i := 0; i < totalChunks; i++ {
		p := filepath.Join(tempDir, strconv.Itoa(i))
		if _, err := os.Stat(p); os.IsNotExist(err) {
			allFinished = false
			break
		}
	}

	if !allFinished {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      "chunk_uploaded",
			"chunk_index": chunkIndex,
		})
		return
	}

	// 4. All chunks present: MERGE them
	// Resolve targetFolderID again if not set
	if targetFolderID == "" && folderName != "" {
		fID, _ := ensureFolderExists(folderName, owner)
		if fID != "" {
			targetFolderID = fID
		}
	}

	destDir, folderSlug, resolvedFolderNameDb, err := resolveDestDir(targetFolderID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	if resolvedFolderName == "" {
		resolvedFolderName = resolvedFolderNameDb
	}

	// Generate unique name
	uniqueSuffix := fmt.Sprintf("%d-%d", time.Now().UnixNano(), 100000000+time.Now().UnixNano()%900000000)
	ext := filepath.Ext(fileName)
	base := strings.TrimSuffix(fileName, ext)
	finalFilename := fmt.Sprintf("%s-%s%s", base, uniqueSuffix, ext)
	finalPhysicalPath := filepath.Join(destDir, finalFilename)

	// Open output merged file
	mergedFile, err := os.Create(finalPhysicalPath)
	if err != nil {
		http.Error(w, `{"error":"Failed to create destination file"}`, http.StatusInternalServerError)
		return
	}
	defer mergedFile.Close()

	// Append each chunk
	for i := 0; i < totalChunks; i++ {
		p := filepath.Join(tempDir, strconv.Itoa(i))
		cFile, err := os.Open(p)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to open chunk %d"}`, i), http.StatusInternalServerError)
			return
		}
		_, err = io.Copy(mergedFile, cFile)
		cFile.Close()
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to merge chunk %d"}`, i), http.StatusInternalServerError)
			return
		}
	}

	// Clean up temp directory
	os.RemoveAll(tempDir)

	// 5. Insert metadata into Supabase Database
	servingPath := ""
	if folderSlug != "" {
		servingPath = fmt.Sprintf("/files/%s/%s", folderSlug, finalFilename)
	} else {
		servingPath = fmt.Sprintf("/files/%s", finalFilename)
	}

	mimetype := mime.TypeByExtension(ext)
	if mimetype == "" {
		mimetype = "application/octet-stream"
	}

	newFile := File{
		Name:       fileName,
		Size:       fileSize,
		Type:       mimetype,
		Path:       servingPath,
		Owner:      owner,
		IsFavorite: false,
	}

	if targetFolderID != "" {
		newFile.FolderID = &targetFolderID
		if resolvedFolderName != "" {
			newFile.FolderName = &resolvedFolderName
		}
	}

	var insertedFiles []File
	err = supabase.Insert("files", []File{newFile}, &insertedFiles)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Database insert error: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if len(insertedFiles) == 0 {
		http.Error(w, `{"error":"Database returned empty response"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "File uploaded and merged successfully",
		"file":    insertedFiles[0],
	})
}

// Helper: resolve dest dir details
func resolveDestDir(folderID string) (destDir string, folderSlug string, folderName string, err error) {
	if folderID == "" {
		return storageDir, "", "", nil
	}

	var folders []Folder
	err = supabase.Select("folders", "name", map[string]string{"id": "eq." + folderID}, &folders)
	if err != nil || len(folders) == 0 {
		return storageDir, "", "", nil
	}

	folderName = folders[0].Name
	// Sanitize folder slug (identical to Node.js regex)
	reg := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	folderSlug = strings.TrimSpace(reg.ReplaceAllString(folderName, "_"))

	destDir = filepath.Join(storageDir, folderSlug)
	err = os.MkdirAll(destDir, 0755)
	return destDir, folderSlug, folderName, err
}

// Helper: ensure folder exists on DB and disk
func ensureFolderExists(name string, owner string) (string, error) {
	// Check if already exists in DB
	var folders []Folder
	err := supabase.Select("folders", "id, name", map[string]string{"name": "eq." + name, "owner": "eq." + owner}, &folders)
	if err == nil && len(folders) > 0 {
		return folders[0].ID, nil
	}

	// Sanitize and create directory
	reg := regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	folderSlug := strings.TrimSpace(reg.ReplaceAllString(name, "_"))
	folderPath := filepath.Join(storageDir, folderSlug)
	os.MkdirAll(folderPath, 0755)

	// Insert new folder
	newFolder := Folder{
		Name:  name,
		Owner: owner,
	}

	var inserted []Folder
	err = supabase.Insert("folders", []Folder{newFolder}, &inserted)
	if err != nil || len(inserted) == 0 {
		return "", fmt.Errorf("failed to create folder: %v", err)
	}

	return inserted[0].ID, nil
}

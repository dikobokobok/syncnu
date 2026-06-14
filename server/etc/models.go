package main

import "time"

// User model mapping to the 'users' table
type User struct {
	ID        string    `json:"id,omitempty"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"password,omitempty"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

// Folder model mapping to the 'folders' table
type Folder struct {
	ID         string     `json:"id,omitempty"`
	Name       string     `json:"name"`
	Owner      string     `json:"owner"`
	CreatedAt  *time.Time `json:"created_at,omitempty"`
	ModifiedAt *time.Time `json:"modified_at,omitempty"`
}

// File model mapping to the 'files' table
type File struct {
	ID          string     `json:"id,omitempty"`
	Name        string     `json:"name"`
	Size        int64      `json:"size"`
	Type        string     `json:"type"`
	Path        string     `json:"path"`
	Owner       string     `json:"owner"`
	FolderID    *string    `json:"folder_id"`
	FolderName  *string    `json:"folder_name"`
	IsFavorite  bool       `json:"is_favorited"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	ModifiedAt  *time.Time `json:"modified_at,omitempty"`
	DeletedAt   *string    `json:"deleted_at"` // ISO8601 string or null
}

// Share model mapping to the 'shares' table
type Share struct {
	ID        string     `json:"id,omitempty"`
	FileID    *string    `json:"file_id,omitempty"`
	FolderID  *string    `json:"folder_id,omitempty"`
	SharedBy  string     `json:"shared_by"`
	SharedTo  *string    `json:"shared_to,omitempty"`
	Token     *string    `json:"token,omitempty"`
	ShareType string     `json:"share_type"`
	CreatedAt *time.Time `json:"created_at,omitempty"`
}

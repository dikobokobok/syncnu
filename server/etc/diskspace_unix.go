//go:build !windows

package main

import (
	"path/filepath"
	"syscall"
)

// GetDiskSpace calculates total and free disk space in bytes (Linux/macOS implementation)
func GetDiskSpace(path string) (total uint64, free uint64, err error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	var stat syscall.Statfs_t
	if err = syscall.Statfs(absPath, &stat); err != nil {
		return 0, 0, err
	}

	total = stat.Blocks * uint64(stat.Bsize)
	free = stat.Bavail * uint64(stat.Bsize)
	return total, free, nil
}

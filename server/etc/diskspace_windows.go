//go:build windows

package main

import (
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	modkernel32             = syscall.NewLazyDLL("kernel32.dll")
	procGetDiskFreeSpaceExW = modkernel32.NewProc("GetDiskFreeSpaceExW")
)

// GetDiskSpace calculates total and free disk space in bytes (Windows implementation)
func GetDiskSpace(path string) (total uint64, free uint64, err error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	pathPtr, err := syscall.UTF16PtrFromString(absPath)
	if err != nil {
		return 0, 0, err
	}

	var freeBytes, totalBytes, totalFreeBytes uint64
	r1, _, e1 := syscall.SyscallN(
		procGetDiskFreeSpaceExW.Addr(),
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytes)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if r1 == 0 {
		if e1 != 0 {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
		return 0, 0, err
	}

	return totalBytes, freeBytes, nil
}

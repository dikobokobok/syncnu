package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// JWTClaims represents claims for Syncnu JWT tokens
type JWTClaims struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	jwt.RegisteredClaims
}

// Env configuration map
var envMap = make(map[string]string)

// LoadEnv loads key=value pairs from the .env file
func LoadEnv() {
	// Search in current dir, parent, and grandparent directories
	paths := []string{
		".env",
		"../.env",
		"../../.env",
	}

	var foundPath string
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			foundPath = p
			break
		}
	}

	if foundPath == "" {
		fmt.Println("Warning: .env file not found. Falling back to system environment variables.")
		return
	}

	file, err := os.Open(foundPath)
	if err != nil {
		fmt.Printf("Error opening .env file: %v\n", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		// Strip quotes if any
		if (strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"")) ||
			(strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'")) {
			val = val[1 : len(val)-1]
		}

		envMap[key] = val
		os.Setenv(key, val)
	}

	fmt.Printf("Loaded environment variables from %s\n", foundPath)
}

// GetEnv gets an env variable with a default fallback
func GetEnv(key, defaultVal string) string {
	if val, ok := envMap[key]; ok {
		return val
	}
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// HashPassword hashes password using bcrypt
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPasswordHash compares bcrypt hash and plain password
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GenerateJWT creates a new JWT token signed with JWT_SECRET
func GenerateJWT(id, email, name string) (string, error) {
	secret := GetEnv("JWT_SECRET", "syncnu_fallback_secret")
	claims := JWTClaims{
		ID:    id,
		Email: email,
		Name:  name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ValidateJWT parses and validates a JWT token string
func ValidateJWT(tokenStr string) (*JWTClaims, error) {
	secret := GetEnv("JWT_SECRET", "syncnu_fallback_secret")
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// GetDirSize recursively calculates directory size in bytes
func GetDirSize(path string) int64 {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	if err != nil {
		return 0
	}
	return size
}

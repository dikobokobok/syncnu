package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

type SupabaseClient struct {
	URL            string
	ServiceRoleKey string
	HTTPClient     *http.Client
}

var supabase *SupabaseClient

// InitSupabase initializes the global Supabase client
func InitSupabase() {
	urlVal := GetEnv("REACT_APP_SUPABASE_URL", "")
	keyVal := GetEnv("SUPABASE_SERVICE_ROLE_KEY", "")
	if keyVal == "" {
		keyVal = GetEnv("REACT_APP_SUPABASE_ANON_KEY", "")
	}

	if urlVal == "" || keyVal == "" {
		fmt.Println("Warning: Supabase credentials missing. PostgREST database queries will fail.")
	}

	supabase = &SupabaseClient{
		URL:            urlVal,
		ServiceRoleKey: keyVal,
		HTTPClient:     &http.Client{},
	}
}

// Request performs a low-level HTTP request to PostgREST
func (s *SupabaseClient) Request(method, path string, queryParams map[string]string, body interface{}, headers map[string]string) ([]byte, error) {
	if s.URL == "" {
		return nil, fmt.Errorf("supabase URL is empty")
	}

	// Build URL
	u, err := url.Parse(s.URL + "/rest/v1" + path)
	if err != nil {
		return nil, err
	}

	q := u.Query()
	for k, v := range queryParams {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()

	// Marshal body
	var bodyReader io.Reader
	if body != nil {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(bodyBytes)
	}

	// Create request
	req, err := http.NewRequest(method, u.String(), bodyReader)
	if err != nil {
		return nil, err
	}

	// Add default headers for PostgREST
	req.Header.Set("apikey", s.ServiceRoleKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceRoleKey)
	req.Header.Set("Content-Type", "application/json")

	// Set additional headers
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// Execute request
	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("postgrest error (status %d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// Select queries data from a table
func (s *SupabaseClient) Select(table string, selectFields string, queryParams map[string]string, target interface{}) error {
	params := make(map[string]string)
	for k, v := range queryParams {
		params[k] = v
	}
	params["select"] = selectFields

	resp, err := s.Request("GET", "/"+table, params, nil, nil)
	if err != nil {
		return err
	}

	return json.Unmarshal(resp, target)
}

// Insert inserts one or more records into a table
func (s *SupabaseClient) Insert(table string, records interface{}, target interface{}) error {
	headers := map[string]string{
		"Prefer": "return=representation",
	}

	// If records is not already a slice, wrap it in a slice for PostgREST
	var body interface{} = records
	// Note: PostgREST inserts usually take a JSON array of objects. We can pass a slice or single map/struct.
	// But standard is a JSON array.

	resp, err := s.Request("POST", "/"+table, nil, body, headers)
	if err != nil {
		return err
	}

	return json.Unmarshal(resp, target)
}

// Update updates records matching query filters
func (s *SupabaseClient) Update(table string, filters map[string]string, updateData interface{}, target interface{}) error {
	headers := map[string]string{
		"Prefer": "return=representation",
	}

	resp, err := s.Request("PATCH", "/"+table, filters, updateData, headers)
	if err != nil {
		return err
	}

	return json.Unmarshal(resp, target)
}

// Delete deletes records matching query filters
func (s *SupabaseClient) Delete(table string, filters map[string]string, target interface{}) error {
	headers := map[string]string{
		"Prefer": "return=representation",
	}

	resp, err := s.Request("DELETE", "/"+table, filters, nil, headers)
	if err != nil {
		return err
	}

	return json.Unmarshal(resp, target)
}

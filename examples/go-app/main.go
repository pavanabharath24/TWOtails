package main

import (
	"fmt"
	"net/http"
	"os"
	"sync"
)

// Unused import
import "strings"

func handleRequest(w http.ResponseWriter, r *http.Request) {
	// Goroutine without WaitGroup
	go func() {
		fmt.Println("Processing...")
	}()
	
	fmt.Fprintf(w, "Hello, World!")
}

func processFile(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return nil
	}
	defer file.Close()
	
	return nil
}

func main() {
	http.HandleFunc("/", handleRequest)
	fmt.Println("Server starting...")
	http.ListenAndServe(":8080", nil)
}

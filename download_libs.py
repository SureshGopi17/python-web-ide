import os
import urllib.request

LIBS_DIR = "libs"
PYODIDE_DIR = os.path.join(LIBS_DIR, "pyodide")
MONACO_DIR = os.path.join(LIBS_DIR, "monaco", "vs")

# File mappings (URL -> local path relative to project root)
FILES_TO_DOWNLOAD = {
    # Pyodide core files
    "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js": os.path.join(PYODIDE_DIR, "pyodide.js"),
    "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.js": os.path.join(PYODIDE_DIR, "pyodide.asm.js"),
    "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.asm.wasm": os.path.join(PYODIDE_DIR, "pyodide.asm.wasm"),
    "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide-lock.json": os.path.join(PYODIDE_DIR, "pyodide-lock.json"),
    
    # Monaco Editor files
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js": os.path.join(MONACO_DIR, "loader.js"),
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.js": os.path.join(MONACO_DIR, "editor", "editor.main.js"),
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.css": os.path.join(MONACO_DIR, "editor", "editor.main.css"),
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.nls.js": os.path.join(MONACO_DIR, "editor", "editor.main.nls.js"),
    "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.worker.js": os.path.join(MONACO_DIR, "editor", "editor.worker.js")
}

def download_file(url, dest_path):
    # Ensure directory exists
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    print(f"Downloading {url} -> {dest_path}...")
    try:
        # Standard urllib request
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
            out_file.write(response.read())
        print("Success.")
    except Exception as e:
        print(f"FAILED to download {url}: {e}")

if __name__ == "__main__":
    print("Starting download of libraries for offline usage...")
    for url, path in FILES_TO_DOWNLOAD.items():
        download_file(url, path)
    print("Finished downloads.")

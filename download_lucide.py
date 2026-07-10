import os
import urllib.request

dest_path = os.path.join("libs", "lucide.min.js")
os.makedirs(os.path.dirname(dest_path), exist_ok=True)

url = "https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"
print(f"Downloading {url} -> {dest_path}...")
try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
        out_file.write(response.read())
    print("Success.")
except Exception as e:
    print(f"FAILED to download Lucide: {e}")

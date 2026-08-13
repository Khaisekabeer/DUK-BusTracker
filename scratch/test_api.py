import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:5004/api/v1/stops", timeout=5) as response:
        status = response.getcode()
        body = response.read().decode('utf-8')
        print(f"Status Code: {status}")
        print("Response Body:")
        print(body[:500])
except Exception as e:
    print(f"Error occurred: {e}")

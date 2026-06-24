# Code Generation & Output Format Specification

This document details how the Smart API DevTool packages, displays, and delivers generated code assets and test files to the developer.

---

## 1. User Interface Display (Tabbed Preview)
When the LangGraph self-healing agent completes generation, the Web UI renders a tabbed workspace containing five distinct views:

1. **Overview & Auth Tab**: Displays extracted auth methods and the integration path recommendation (REST vs. SDK).
2. **Endpoints Explorer Tab**: Shows an interactive dictionary of endpoints (GET, POST, DELETE), headers, query params, and request payloads.
3. **Wrapper Class Tab**: Displays the syntax-highlighted source code of the generated client wrapper.
4. **Unit Tests Tab**: Displays the generated testing suite script.
5. **README Guide Tab**: Displays markdown usage instructions, library dependencies, and instantiation examples.

---

## 2. Download Deliverables & File Structure
Developers can download files individually or as a unified bundle.

### Option A: The Integration Bundle (ZIP)
Clicking the **"Download Integration Bundle (ZIP)"** button packages all generated files into a single ZIP file dynamically in the browser using `JSZip`. The extracted bundle structure varies by language:

#### Python
```text
my-api-integration/
├── README.md          # Setup instructions, dependencies, and code import examples
├── client.py          # The generated, type-safe wrapper class
└── test_client.py     # The Pytest test suite for validation (unittest.mock)
```

#### JavaScript
```text
my-api-integration/
├── README.md          # Setup instructions and CommonJS import examples
├── client.js          # The client class (exported via module.exports = { MyClientClass };)
└── test_client.test.js # Standalone Node test script using named require and global fetch patch
```

#### TypeScript
```text
my-api-integration/
├── README.md          # Setup instructions and TS import examples
├── client.ts          # The client class (exported via export class MyClientClass { ... })
├── test_client.test.ts # Standalone TS test script using named imports
└── tsconfig.json      # Minimal TypeScript config for sandbox/ts-node runtimes
```

#### Go
```text
my-api-integration/
├── README.md          # Setup instructions and go package import examples
├── client.go          # Go package source file defining the client struct
├── client_test.go     # Native Go test suite using testing package and httptest.NewServer
└── go.mod             # Temporary Go module name definition
```

#### Java
```text
my-api-integration/
├── README.md          # Setup instructions and compilation steps
├── MyAPIClient.java   # The Java client class (using java.net.http.HttpClient)
└── TestClient.java    # Standalone Java class with main() method running assertions (-ea)
```

---

## 3. Reference Output Code Structures

Below are the standard, production-ready structures of generated client wrappers and test suites.

### Python Client (Requests + Tenacity Retry)
The Python client utilizes `requests.Session` for connection pooling, type hints, custom error wrappers, and `tenacity.Retrying` dynamically at runtime to respect user configurations:

```python
import requests
from tenacity import Retrying, stop_after_attempt, wait_exponential, retry_if_exception_type
from typing import Dict, Any, Optional

class APIError(Exception):
    """Base exception for API errors."""
    pass

class APIRateLimitError(APIError):
    """Exception for rate limits (429)."""
    pass

class APIServerError(APIError):
    """Exception for server-side downtime (5xx)."""
    pass

class APIClient:
    def __init__(self, api_key: str, base_url: str = "https://api.example.com/v1", max_retries: int = 3):
        if not api_key:
            raise ValueError("API key cannot be empty.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })

    def _retry_request(self, func):
        """Dynamic tenacity runner to enforce instance-level retry limits."""
        retrier = Retrying(
            stop=stop_after_attempt(self.max_retries + 1),
            wait=wait_exponential(multiplier=0.5, min=1, max=30),
            retry=(
                retry_if_exception_type(APIRateLimitError) |
                retry_if_exception_type(APIServerError)
            ),
            reraise=True
        )
        return retrier(func)

    def _make_request(self, method: str, path: str, json_data=None) -> Dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        response = self.session.request(method, url, json=json_data, timeout=10)
        
        if response.status_code == 429:
            raise APIRateLimitError(f"Rate limited: {response.text}")
        elif response.status_code >= 500:
            raise APIServerError(f"Server error: {response.status_code}")
        
        response.raise_for_status()
        return response.json()

    def get_resource(self, resource_id: str) -> Dict[str, Any]:
        return self._retry_request(lambda: self._make_request("GET", f"/resources/{resource_id}"))
```

### JavaScript Client & Test (CommonJS + Async IIFE Test Harness)
The JavaScript client uses named exports, the global `fetch` API, and standard Node.js assertions inside a self-contained sequential test block:

```javascript
// client.js
class APIClient {
   constructor(apiKey) {
      if (!apiKey) throw new Error('API key cannot be empty.');
      this.apiKey = apiKey;
      this.baseUrl = 'https://api.example.com/v1';
   }

   async getResource(resourceId) {
      const response = await fetch(`${this.baseUrl}/resources/${resourceId}`, {
         method: 'GET',
         headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
         }
      });
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      return await response.json();
   }
}

module.exports = { APIClient };
```

```javascript
// test_client.test.js
const assert = require('assert');
const { APIClient } = require('./client');

async function runTests() {
   const originalFetch = globalThis.fetch;
   try {
      // Setup local request mock
      globalThis.fetch = async (url, options) => {
         assert.strictEqual(options.headers['Authorization'], 'Bearer test-key');
         return {
            ok: true,
            json: async () => ({ id: '123', name: 'Sample' })
         };
      };

      const client = new APIClient('test-key');
      const data = await client.getResource('123');
      assert.deepStrictEqual(data, { id: '123', name: 'Sample' });
      
      console.log('All tests passed successfully.');
   } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
   } finally {
      globalThis.fetch = originalFetch;
   }
   process.exit(0);
}

runTests();
```

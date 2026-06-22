# Code Generation & Output Format Specification

This document details how the Smart API DevTool packages, displays, and delivers generated code assets to the user.

---

## 1. User Interface Display (Tabbed Preview)
When the LangGraph self-healing agent completes generation, the Web UI renders a tabbed workspace containing four distinct views:

1. **Overview & Auth Tab**: Displays extracted auth methods and the integration path recommendation (REST vs. SDK).
2. **Endpoints Explorer Tab**: Shows an interactive dictionary of endpoints (GET, POST, DELETE), headers, query params, and request payloads.
3. **Wrapper Class Tab**: Displays the syntax-highlighted source code of the generated client wrapper.
4. **Unit Tests Tab**: Displays the generated testing suite script.
5. **README Guide Tab**: Displays markdown usage instructions, library dependencies, and instantiation examples.

---

## 2. Download Deliverables & File Structure
Developers can download files individually or as a unified bundle.

### Option A: The Integration Bundle (ZIP)
Clicking the **"Download Integration Bundle (ZIP)"** button packages all generated files into a single ZIP file dynamically in the browser using `JSZip`. The extracted bundle uses the following structured layout:

```text
my-api-integration/
├── README.md          # Setup instructions, dependencies, and code import examples
├── client.py          # The generated, type-safe wrapper class
└── test_client.py     # The Pytest test suite for validation
```

### Option B: Individual Downloads
Each preview tab features a dedicated download button to save that specific file (e.g. saving only `client.py`).

---

## 3. Reference Output Code Structure (Python Example)

Below is the standard, production-ready structure of a generated Python client wrapper. It includes type hinting, exception handling, requests sessions, and exponential backoff retry algorithms for rate-limiting (429) or transient server errors (5xx):

```python
import time
import requests
from typing import Dict, Any, Optional

class APIClientError(Exception):
    """Base exception for client errors."""
    pass

class MyAPIClient:
    def __init__(self, api_key: str, base_url: str = "https://api.example.com/v1", max_retries: int = 3):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        })

    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """Executes HTTP request with exponential backoff on rate limits/server errors."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        retries = 0
        backoff = 1.0

        while retries < self.max_retries:
            try:
                response = self.session.request(method, url, timeout=10, **kwargs)
                
                # Handle Rate Limiting (429) or Temporary Server Downtime (5xx)
                if response.status_code in [429, 500, 502, 503, 504]:
                    retries += 1
                    time.sleep(backoff)
                    backoff *= 2  # Exponential backoff
                    continue
                
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                if retries == self.max_retries - 1:
                    raise APIClientError(f"API request failed: {e}")
                retries += 1
                time.sleep(backoff)
                backoff *= 2

        raise APIClientError("Max retries exceeded")

    def create_checkout_session(self, amount: int, currency: str) -> Dict[str, Any]:
        """
        Creates a payment checkout session.
        Args:
            amount: Integer value in cents.
            currency: 3-letter ISO code (e.g. usd).
        """
        payload = {"amount": amount, "currency": currency}
        return self._request("POST", "/checkout/sessions", json=payload)
```

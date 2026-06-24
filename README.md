# Smart API DevTool

A local developer utility that automates third-party API integration. By taking an API documentation URL (or raw pasted text) and a description of your target use case, it scrapes endpoints, recommends integration paths, generates type-safe wrapper classes, and automatically compiles and self-heals any code bugs using localized sandboxes.

The engine validates the scraped content using an LLM **Pre-Check Grounding Validation** step to ensure REST specifications exist (failing fast on high-level landing pages), and uses **LangGraph** to coordinate a self-correcting loop that feeds compiler and test logs back to the LLM (up to 3 retries) until the generated assets compile and pass mock checks.

> [!NOTE]
> This application is built as a hybrid workspace: it serves both a premium **Web Dashboard** (FastAPI backend + Glassmorphic HTML/CSS/JS frontend) and a local **Model Context Protocol (MCP) Server** to let IDE agents (like Claude Desktop or Cursor) call the scraping and wrapper generation natively.

---

## Technical Stack & Runtimes

* **Core Engine**: Python 3.12, FastAPI, Uvicorn, Pydantic Settings
* **Agentic Graph**: LangGraph state machine orchestrator
* **AI Generation**: Google Gemini API (via official `google-genai` SDK), Groq API, OpenRouter API, & local Ollama (`qwen2.5-coder`)
* **Scraper**: Firecrawl REST scraping service (supporting both API keys and keyless fallback)
* **Sandboxed Compilers**: Spawns isolated local runtimes for Python (`pytest`), JavaScript (`node`), TypeScript (`ts-node`), Go (`go test`), and Java (`javac`/`java`)

> [!IMPORTANT]
> To execute multi-language sandboxes, the corresponding compilers/runtimes (like `node`, `go`, and `jdk`) must be installed on your local host system. If a runtime is absent, the execution service traps the exception and returns the diagnostic failure cleanly without crashing the core agent thread.

---

## Project Structure

```text
├── main.py                 # Entrypoint (CLI flags to launch FastAPI Web Server or MCP Server)
├── requirements.txt        # Virtual environment python dependencies
├── Dockerfile              # Unified build image containing Node, Go, Java, and Python runtimes
├── src/
│   ├── app.py              # FastAPI server routes, static assets serving, and CORS config
│   ├── config.py           # Configuration manager validating env parameters via Pydantic
│   ├── agent.py            # LangGraph StateGraph, pre-check validation, and code execution nodes
│   └── services/
│       ├── scraper.py      # Firecrawl client featuring SSL and rate limit retries
│       └── executor.py     # Sandbox subprocess runner with dynamic compiler timeouts
├── public/                 # Web Dashboard assets (HTML, glassmorphism CSS, and controllers)
├── lessons/                # Academic curriculum detailing sandbox patterns and state machines
└── learning-records/       # Technical log tracking system designs and key architectural choices
```

---

## Local Setup

### 1. Clone & Set Up Python Environment

Ensure Python 3.12+ is installed:

```bash
python -m venv venv
venv\Scripts\activate      # On Windows
source venv/bin/activate    # On Unix/macOS
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```ini
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
FIRECRAWL_API_KEY=optional_firecrawl_api_key
OLLAMA_BASE_URL=http://localhost:11434
HOST=0.0.0.0
PORT=7860
```

> [!TIP]
> If you don't supply a Firecrawl API key, the scraping service automatically falls back to Firecrawl's Cloud Keyless Mode. Similarly, if you want a local-only setup with zero costs, you can select the **Ollama** model provider in the interface to route generations to your local `qwen2.5-coder` instance.

### 3. Run the FastAPI Web Server

```bash
python main.py
```

Open `http://localhost:7860` in your web browser to explore the dashboard.

---

## How the Self-Healing Loop Works

```text
  [Docs Scraping] ──► [Grounding Pre-Check] ──► [Initial Generator Node] ──► [Sandbox Test Node]
                              │                          ▲                         │
                              ▼ (No Specs Found)         │ (Test Fails, Retry < 3) │
                        [Fail Fast UI]                   └─────────────────────────┴─► [Passes / Deliver]
```

1. **State Dictionary Initialization**: The agent state stores the scraped markdown, use case details, target language, and diagnostic records.
2. **Pre-Check Grounding Validation**: Inspects the scraped content first. If the documentation does not contain actual REST specifications or routes, the workflow raises a validation error immediately, prompting the user for a correct URL.
3. **Predict (Generator Node)**: The model outputs structured JSON matching the Pydantic schema containing wrapper code, README, endpoints list, and a test suite.
4. **Act & Verify (Executor Node)**: The Python executor creates an isolated UUID directory under `temp/run_{uuid}`, writes code files, and triggers the language's native test runner (e.g. `pytest`, `node`, `ts-node`, `go test`, `javac`).
5. **Self-Heal (Loop)**: If the test returns a non-zero exit code, the logs (stdout/stderr) are saved to the state, and the graph loops back to the generator, instructing the model to repair the code. If tests pass, it terminates immediately and packages the clean deliverables.

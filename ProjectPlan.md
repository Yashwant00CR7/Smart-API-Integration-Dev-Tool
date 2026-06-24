# Project Master Plan: Smart API DevTool

This document serves as the master coordinator for the **Smart API DevTool** project. It outlines our architectural roadmap, directory structure, Git workflow, and connects all local configuration, lesson, and implementation tracking files.

---

## 1. Project Overview & Architecture

This tool is designed to demonstrate python-based backend engineering, docker configurations, and modern agentic architectures:
1. **Interactive Web Dashboard**: A local Python FastAPI server hosting a premium, dark-themed responsive single-page HTML/CSS/JS frontend.
2. **Model Context Protocol (MCP) Server**: A standard protocol wrapper enabling AI agents (like Claude Desktop or Cursor) to call your scraping and wrapper-generation engine natively from the IDE.

### System Architecture Flow (Unified Core Engine)

Our Core Engine uses **LangGraph** to orchestrate a single-agent **Self-Healing Test Loop** that runs generated unit tests inside our Docker container, captures failures, and auto-corrects code errors.

```
                  ┌────────────────────────────────┐
                  │    Developer Request / Input   │
                  └───────────────┬────────────────┘
                                  │ (URL or Paste Docs)
                                  ▼
                  ┌────────────────────────────────┐
                  │     Core Scraping Service      │
                  │   (Firecrawl Keyless / Local)  │
                  └───────────────┬────────────────┘
                                  │ (Clean Markdown Docs)
                                  ▼
                  ┌────────────────────────────────┐
                  │ Pre-Generation Grounding Check │
                  │  (Validate REST API Specs)     │
                  └───────┬────────────────┬───────┘
                          │                │
            (Specs Found) ▼                ▼ (No Specs Found)
                  ┌────────────────┐  ┌────────────────┐
                  │ Proceed to Gen │  │ Raise error    │
                  └───────┬────────┘  │ (Fail Fast UI) │
                          │           └────────────────┘
                          ▼
                  ┌────────────────────────────────┐
                  │    Unified Provider Router     │
                  │ (Gemini, Groq, OpenRouter,     │
                  │         or Ollama)             │
                  └───────┬────────────────┬───────┘
                          │                │
             (Cloud API)  ▼                ▼ (Local: qwen2.5-coder)
                  ┌──────────────┐  ┌──────────────┐
                  │   Cloud API  │  │  Ollama API  │
                  │ (Gemini/Groq/│  └──────┬───────┘
                  │  OpenRouter) │         │
                  └──────┬───────┘         │
                         │                 │
                         └────────┬────────┘
                                  │ (Initial Wrapper & Test Suite Code)
                                  ▼
                  ┌────────────────────────────────┐
                  │    LangGraph: Generate Node    │◄──────────┐
                  │  (State: code, tests, errors)  │           │
                  └───────────────┬────────────────┘           │ (Failed)
                                  │                            │ Route back
                                  ▼                            │ with error
                  ┌────────────────────────────────┐           │ logs
                  │      LangGraph: Test Node      │           │
                  │  (Executes tests inside the    │           │
                  │   Docker container using local │           │
                  │   subprocesses: pytest, node,  │           │
                  │   ts-node, go, java)           │           │
                  └───────────────┬────────────────┘           │
                                  │                            │
                                  ├─► [Test Fails & Retries < 3]─┘
                                  │
                                  ▼ [Test Passes OR Retries >= 3]
                  ┌────────────────────────────────┐
                  │         END / Deliver          │
                  └───────┬────────────────┬───────┘
                           │                │
                           ▼                ▼
              ┌────────────────────────┐┌────────────────────────┐
              │  Web UI Output Panel   ││  MCP Client Response   │
              │  (Browser Download)    ││  (IDE Code Write)      │
              └────────────────────────┘└────────────────────────┘
```

---

## 2. Directory Structure

```
smart-api-devtool/
├── requirements.txt        - Python dependencies (fastapi, uvicorn, langgraph, google-genai)
├── main.py                 - Entrypoint: launches FastAPI server or MCP server mode
├── Dockerfile              - Docker setup pre-installing Python, Node, Go, and Java runtimes
├── ProjectPlan.md          - Master coordination plan (This file)
├── MISSION.md              - Project goals and learning mission
├── RESOURCES.md            - Curated list of documentation and wisdom links
├── NOTES.md                - Local notes & preferences
├── OutputFormat.md         - Layout formats for code outputs
├── AboutMe.md              - Author profile and hackathon directives
├── PRD.md                  - Product Requirements Document
├── src/
│   ├── config.py           - Application configurations & env validation
│   ├── app.py              - FastAPI server routes, static assets serving, and CORS config
│   ├── mcp_server.py       - Model Context Protocol integration handler
│   ├── agent.py            - LangGraph Agent Definition (State, Nodes, validation, and Graph)
│   └── services/
│       ├── scraper.py      - Firecrawl HTTP client (supports keyless & API keys)
│       └── executor.py     - Subprocess code runner executing python/node/go/java sandboxes
├── public/                 - Web Dashboard Assets
│   ├── index.html          - High-end dark theme dashboard
│   ├── style.css           - Custom glassmorphic styles & animations
│   └── app.js              - Frontend application controller
├── lessons/                - Curriculum for developer topics
└── learning-records/       - Log of key decisions and insights
```

---

## 3. Project References

Use these clickable file links to inspect details, check tasks, and verify progress:

### Core Configuration Files
* **[MISSION.md](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/MISSION.md)**: Goals and scope boundaries.
* **[RESOURCES.md](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/RESOURCES.md)**: Curated scraping and API development guides.
* **[NOTES.md](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/NOTES.md)**: Scratchpad of active work items and preferences.
* **[Output Format Guide](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/OutputFormat.md)**: Details on ZIP structures and generated code client classes.
* **[Developer Profile](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/AboutMe.md)**: Bio and hackathon placement goals.
* **[PRD Specifications](file:///d:/Downloads/Projects/My%20College%20Projects/Smart%20DevTool%20for%20API%20Integration/PRD.md)**: Product Requirements Document with user stories and decisions.

### System-Generated Artifacts
* **[Implementation Plan](file:///C:/Users/yashw/.gemini/antigravity/brain/bfcca984-987f-419e-96de-3d92c17e1877/implementation_plan.md)**: Detailed technical specifications for backend services, API structures, and frontend routes.
* **[Active Task Checklist](file:///C:/Users/yashw/.gemini/antigravity/brain/bfcca984-987f-419e-96de-3d92c17e1877/task.md)**: Current completion status of specific development steps.
* **[Walkthrough Report](file:///C:/Users/yashw/.gemini/antigravity/brain/bfcca984-987f-419e-96de-3d92c17e1877/walkthrough.md)**: Summary of final work, validations, and testing outputs.

---

## 4. Phase-by-Phase Roadmap

### **Phase 1: Project Setup & Core Services (Completed)**
* Configure Python virtual environment and `requirements.txt`.
* Write the `Dockerfile` installing Python, Node, Go, and Java runtimes.
* Set up FastAPI app boilerplate (`main.py`, `src/app.py`).
* Code `scraper.py` using Firecrawl REST interface.
* Code test runner `executor.py` utilizing Python subprocesses to execute language-specific test runs inside a `/temp` folder sandbox.
* *Verification*: Verify URL scraping and local test-suite executions via scripts.

### **Phase 2: LangGraph Self-Healing Agent (Completed)**
* Define the LangGraph State, `generate` Node, and `test` Node.
* Code the conditional transition edge (Self-Heal Loop up to 3 retries).
* Connect the compiled LangGraph to the FastAPI endpoints.
* *Verification*: Verify self-healing loop by running local tests.

### **Phase 3: MCP Server Integration (Completed)**
* Implement `mcp_server.py` using standard Model Context Protocol stream handlers.
* Bind standard CLI flag (`python main.py --mcp`) to run the MCP server.

### **Phase 4: Premium Web UI & Exporter (Completed)**
* Design HTML5 layout with glassmorphism CSS aesthetics.
* Incorporate model selector dropdowns (Gemini, Ollama, Groq, OpenRouter), and live terminal logging showing the self-healing test runs.
* Expose code exports (downloading wrapper, unit tests, and README file in a single ZIP).

### **Phase 5: Hugging Face Spaces Deployment (Completed)**
* Deploy the application to a Hugging Face Space using the custom Dockerfile.
* *Verification*: Test the hosted web service dynamically in the cloud.

### **Phase 6: Grounding Hardening & Git Delivery (Completed)**
* Implement LLM-based pre-generation documentation checks to prevent endpoint hallucinations.
* Apply strict dependency-free test execution rules across all five supported languages.
* Format the codebase, compile the walkthrough report, and commit changes using Conventional Commit patterns.

---

## 5. Future System Design Proposals

### Architectural Question: Concurrency & Sandbox Isolation on Free Cloud Runtimes
> *"If there are 10 to 100 users using a local host, when they are using local host and if they do not have the package installed, we do not want to disturb their local system. If we use the Docker availability in Hugging Face and make it a common platform to run all the tasks for those 100 users, there is a resources bottleneck on the free tier (2 vCPUs, 16 GB RAM). How can we resolve this on a free-tier basis to improve project system design?"*

### Proposed Solution: Piston-Based Serverless Code Execution
To eliminate compiler installation overhead inside the host Docker image and prevent CPU/RAM resource starvation under concurrent user spikes, we propose offloading sandbox executions to a serverless code execution engine:

#### 1. How it Works
- Instead of executing tests locally via Python subprocesses (`pytest`, `node`, `go test`, `javac`), the sandbox executor (`src/services/executor.py`) delegates execution to a **Piston API** endpoint.
- The executor constructs an HTTP POST request containing the generated wrapper source code, the test file code, and the language identifier, sending it to a public or private Piston API instance:
  ```http
  POST /api/v2/execute HTTP/1.1
  Host: emkc.org
  Content-Type: application/json

  {
    "language": "python",
    "version": "3.10.0",
    "files": [
      {
        "name": "client.py",
        "content": "class MyAPIClient: ..."
      },
      {
        "name": "test_client.py",
        "content": "def test_get_user(): ..."
      }
    ]
  }
  ```
- The Piston container runs the tests in isolation and returns structured JSON containing the stdout, stderr, and process exit code.

#### 2. Architectural Impact
* **Pros:**
  - **Ultra-Lightweight Containers:** Deletes heavy compilers (golang, default-jdk, nodejs) from the custom Dockerfile, shrinking the image size from ~2GB to <200MB.
  - **Zero CPU/RAM Contention:** Shifting the compilation work off the Hugging Face Space protects it from OOM (Out of Memory) crashes when 100 concurrent users trigger code executions.
  - **No Local Installs:** Users do not need any local compiler packages on their system, maintaining complete environment isolation.
* **Cons:**
  - Introduces a network dependency on third-party public execution endpoints, which may be subject to external rate limits or availability.

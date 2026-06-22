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
                  │   Unified LangGraph Router     │
                  │   (Select: Gemini or Ollama)   │
                  └───────┬────────────────┬───────┘
                          │                │
             (Cloud API)  ▼                ▼ (Local: qwen2.5-coder)
                  ┌──────────────┐  ┌──────────────┐
                  │  Gemini API  │  │  Ollama API  │
                  └──────┬───────┘  └──────┬───────┘
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
                  │   subprocesses: pytest, go,    │           │
                  │   npm test, java, etc.)        │           │
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
│   ├── app.py              - FastAPI server initialization & router bindings
│   ├── mcp_server.py       - Model Context Protocol integration handler
│   ├── agent.py            - LangGraph Agent Definition (State, Nodes, and Graph)
│   └── services/
│       ├── scraper.py      - Firecrawl HTTP client (supports keyless & API keys)
│       └── executor.py     - Subprocess code runner executing pytest/node/go sandboxes
├── public/                 - Web Dashboard Assets
│   ├── index.html          - High-end dark theme dashboard
│   ├── style.css           - Custom glassmorphic styles & animations
│   └── app.js              - Frontend application controller
├── lessons/                - Curriculum for developer topics
│   └── 0001-problems-and-bottlenecks.html
└── learning-records/       - Log of key decisions and insights
    └── 0001-api-integration-problems.md
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
* **[Implementation Plan](file:///C:/Users/yashw/.gemini/antigravity/brain/84e3a33e-cbe6-43ee-82d2-fdb6c0157c3f/implementation_plan.md)**: Detailed technical specifications for backend services, API structures, and frontend routes.
* **[Active Task Checklist](file:///C:/Users/yashw/.gemini/antigravity/brain/84e3a33e-cbe6-43ee-82d2-fdb6c0157c3f/task.md)**: Current completion status of specific development steps.
* **[Walkthrough Report](file:///C:/Users/yashw/.gemini/antigravity/brain/84e3a33e-cbe6-43ee-82d2-fdb6c0157c3f/walkthrough.md)**: Summary of final work, validations, and testing outputs (to be created at project completion).

---

## 4. Phase-by-Phase Roadmap

### **Phase 1: Project Setup & Core Services**
* Configure Python virtual environment and `requirements.txt`.
* Write the `Dockerfile` installing Python, Node, Go, and Java runtimes.
* Set up FastAPI app boilerplate (`main.py`, `src/app.py`).
* Code `scraper.py` using Firecrawl REST interface.
* Code test runner `executor.py` utilizing Python subprocesses to execute language-specific test runs inside a `/temp` folder sandbox.
* *Verification*: Verify URL scraping and local test-suite executions via scripts.

### **Phase 2: LangGraph Self-Healing Agent**
* Define the LangGraph State, `generate` Node, and `test` Node.
* Code the conditional transition edge (Self-Heal Loop up to 3 retries).
* Connect the compiled LangGraph to the FastAPI endpoints.
* *Verification*: Verify self-healing loop by running local tests.

### **Phase 3: MCP Server Integration**
* Implement `mcp_server.py` using standard Model Context Protocol stream handlers.
* Bind standard CLI flag (`python main.py --mcp`) to run the MCP server.

### **Phase 4: Premium Web UI**
* Design HTML5 layout with glassmorphism CSS aesthetics.
* Incorporate Ollama selector dropdown, custom prompts configuration, and live terminal logging showing the self-healing test runs.
* Expose code exports (downloading wrapper, unit tests, and README file).

### **Phase 5: Hugging Face Spaces Deployment**
* Deploy the application to a Hugging Face Space using the custom Dockerfile.
* *Verification*: Test the hosted web service dynamically in the cloud.

### **Phase 6: Walkthrough & Git Delivery**
* Format the codebase, compile the walkthrough report, and commit changes using Conventional Commit patterns.

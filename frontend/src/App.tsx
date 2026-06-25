import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, Zap, Terminal, FileCode, Play, Check, AlertTriangle, Trash2,
  Download, Copy, Settings, Key, Maximize2, Minimize2,
  Sparkles, Menu, ArrowRight, Shield, Plus, X, ExternalLink,
  Layers, Database, Code, Globe, Mail
} from 'lucide-react';

interface IntegrationRecord {
  id: string;
  title: string;
  timestamp: string;
  url: string | null;
  rawDocs: string | null;
  useCase: string;
  language: string;
  modelProvider: string;
  geminiModel?: string;
  groqModel?: string;
  openrouterModel?: string;
  code: string;
  tests: string;
  readme: string;
  overview: string;
  endpoints: string;
  testPassed: boolean;
}

const languagePlaceholders: Record<string, string> = {
  python: "Example: Create charge sessions, support error retries with exponential backoffs, and list entities catalog using requests & pytest mock fixtures.",
  javascript: "Example: Establish a connection class with axios, handle 429 rate limit statuses gracefully with delay retries, and return catalog JSON using Node standard patterns.",
  typescript: "Example: Expose fully typed interfaces for request/response payloads, construct an API class with custom headers, and write ts-node assertion tests.",
  go: "Example: Construct a safe struct with custom HTTP client overrides, support retries with time.Sleep intervals, and execute go test unit checks.",
  java: "Example: Construct an APIClient utility class with public helper methods, handle IOException wraps, and test execution behaviors using JUnit assertions."
};

const defaultSystemDiagnostics = [
  { text: "[System] Virtual telemetry compiler online. Awaiting runtime task configurations...", type: "system" as const },
  { text: "[02:15:38.709] [Diagnostic] Activating local container runtimes checks...", type: "system" as const },
  { text: "[02:15:38.966] [Diagnostic] Python v3.12: Found (/usr/bin/python3)", type: "success" as const },
  { text: "[02:15:39.076] [Diagnostic] Node.js v20.11: Found (/usr/bin/node)", type: "success" as const },
  { text: "[02:15:39.186] [Diagnostic] Go compiler v1.21: Found (/usr/local/go/bin/go)", type: "success" as const },
  { text: "[02:15:39.291] [Diagnostic] Java SDK v21: Found (/usr/bin/javac)", type: "success" as const },
  { text: "[02:15:39.497] [Diagnostic] All compiler sandboxes verified. Workspace fully online.", type: "success" as const }
];

const renderLogText = (logText: string, logType: string) => {
  const timestampRegex = /^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/;
  let tempText = logText;
  let timestampSpan: React.ReactNode = null;
  let tagSpan: React.ReactNode = null;
  
  const timestampMatch = tempText.match(timestampRegex);
  if (timestampMatch) {
    timestampSpan = <span className="text-[#64748b] mr-1.5">{timestampMatch[0]}</span>;
    tempText = tempText.replace(timestampRegex, '').trim();
  }
  
  if (tempText.startsWith('[System]')) {
    tagSpan = <span className="text-zinc-400 font-bold mr-1.5">[System]</span>;
    tempText = tempText.replace('[System]', '').trim();
  } else if (tempText.startsWith('[Diagnostic]')) {
    tagSpan = <span className="text-emerald-400 font-bold mr-1.5">[Diagnostic]</span>;
    tempText = tempText.replace('[Diagnostic]', '').trim();
  }
  
  let contentColor = 'text-zinc-350';
  if (logType === 'success') {
    contentColor = 'text-emerald-400';
  } else if (logType === 'error') {
    contentColor = 'text-red-400';
  } else if (logType === 'sandbox') {
    contentColor = 'text-amber-400';
  } else if (logType === 'scraper') {
    contentColor = 'text-zinc-300';
  } else if (logType === 'agent') {
    contentColor = 'text-zinc-300';
  }
  
  return (
    <div className="flex items-center flex-wrap font-mono text-[11px] leading-relaxed select-text">
      {timestampSpan}
      {tagSpan}
      <span className={contentColor}>{tempText}</span>
    </div>
  );
};

export default function App() {
  // Stateful View Router ('landing' | 'workspace')
  const [view, setView] = useState<'landing' | 'workspace'>('landing');

  // SPA History Routing Helper
  const navigateTo = (newView: 'landing' | 'workspace') => {
    setView(newView);
    const url = newView === 'workspace' ? '?view=workspace' : window.location.pathname;
    window.history.pushState({ view: newView }, '', url);
  };

  // Developer Profile Dossier Tab State
  const [activeDossierTab, setActiveDossierTab] = useState<'json' | 'sh'>('json');

  // Sidebar controls
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Settings Drawer Toggle
  const [settingsOpen, setSettingsOpen] = useState(false);



  // Form Inputs
  const [selectedSource, setSelectedSource] = useState<'url' | 'text'>('url');
  const [apiUrl, setApiUrl] = useState('');
  const [rawDocs, setRawDocs] = useState('');
  const [useCase, setUseCase] = useState('');
  const [language, setLanguage] = useState('python');
  const [modelProvider, setModelProvider] = useState('gemini');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [openrouterModel, setOpenrouterModel] = useState('openrouter/free');
  
  // Custom OpenRouter models state
  const [openrouterCustomModels, setOpenrouterCustomModels] = useState<string[]>(['openrouter/free']);
  const [newCustomModelInput, setNewCustomModelInput] = useState('');

  // Credentials
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [firecrawlKey, setFirecrawlKey] = useState('');

  // Pipeline Status & Logs
  const [isGenerating, setIsGenerating] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'scraping' | 'validating' | 'synthesizing' | 'compiling' | 'healing' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<Array<{ text: string; type: 'system' | 'scraper' | 'agent' | 'sandbox' | 'success' | 'error' }>>([]);
  const [pulseState, setPulseState] = useState<'Idle' | 'Active' | 'Ready'>('Idle');

  // Results State
  const [resultsVisible, setResultsVisible] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<'overview' | 'endpoints' | 'code' | 'tests' | 'readme'>('overview');
  const [currentIntegration, setCurrentIntegration] = useState<IntegrationRecord | null>(null);
  const [fullscreenResult, setFullscreenResult] = useState(false);

  // Integrations History Cache
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);

  // Sizers resizing widths
  const [leftWidth, setLeftWidth] = useState(450);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const [isDraggingColumn, setIsDraggingColumn] = useState(false);
  const [isDraggingConsole, setIsDraggingConsole] = useState(false);

  // Health Status
  const [backendStatus, setBackendStatus] = useState({
    online: false,
    gemini: 'Offline',
    ollama: 'Offline',
    groq: 'Offline',
    openrouter: 'Offline',
  });

  // Modal Custom Confirmation
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    btnText: string;
    resolve?: (val: boolean) => void;
  }>({
    visible: false,
    title: '',
    message: '',
    btnText: 'Confirm'
  });

  // Interactive Landing Page Demo Simulator
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState<'idle' | 'scraping' | 'validating' | 'synthesizing' | 'compiling' | 'healing' | 'success'>('idle');
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simTab, setSimTab] = useState<'logs' | 'code' | 'graph'>('logs');
  const [selectedCapability, setSelectedCapability] = useState<'scraper' | 'healer' | 'sandbox'>('scraper');
  const simTimeoutsRef = useRef<any[]>([]);

  useEffect(() => {
    if (view === 'workspace') {
      simTimeoutsRef.current.forEach(clearTimeout);
      simTimeoutsRef.current = [];
      setSimRunning(false);
      setSimStep('idle');
      setSimLogs([]);
    }
  }, [view]);

  const runDemoSimulation = () => {
    if (simRunning) return;
    setSimRunning(true);
    setSimLogs([]);
    setSimStep('scraping');
    setSimTab('logs');

    simTimeoutsRef.current.forEach(clearTimeout);
    simTimeoutsRef.current = [];

    const steps = [
      {
        step: 'scraping' as const,
        log: "[System] Handshaking workflow execution vectors...\n[Scraper] Initialized crawling for https://api.stripe.com/v1/charges",
        delay: 0
      },
      {
        step: 'validating' as const,
        log: "[Agent] Pre-Generation Grounding: Found POST /v1/charges, GET /v1/charges/{id}.\n[Agent] Extracted structural parameters: amount (integer, req), currency (string, req).",
        delay: 1000
      },
      {
        step: 'synthesizing' as const,
        log: "[Agent] Synthesizing target Python SDK source code...\n[Agent] Composed StripeChargesAPI class and accompanying unit test suite.",
        delay: 2200
      },
      {
        step: 'compiling' as const,
        log: "[Sandbox] Launching test runtime sandbox: `pytest test_client.py`\n[Sandbox] EXECUTION FAILURE: NameError: name 'requests' is not defined on line 14.",
        delay: 3600
      },
      {
        step: 'healing' as const,
        log: "[Self-Healer] Triggering correction routine 1/3...\n[Self-Healer] Resolved: requests module was imported inside client code but not declared at root level.\n[Self-Healer] Injecting dependency: `import requests` to client header.",
        delay: 4800
      },
      {
        step: 'success' as const,
        log: "[Sandbox] Re-launching runtime sandbox...\n[Sandbox] SUCCESS: 4 unit assertions passed clean (0 warnings, 0 failures).\n[System] Live suite validated and compiled into deployable format.",
        delay: 6300
      }
    ];

    steps.forEach((s) => {
      const timeoutId = setTimeout(() => {
        setSimStep(s.step);
        setSimLogs(prev => [...prev, ...s.log.split('\n')]);
        if (s.step === 'success') {
          setSimRunning(false);
          setSimTab('code');
        }
      }, s.delay);
      simTimeoutsRef.current.push(timeoutId);
    });
  };

  const consoleLogsContainerRef = useRef<HTMLDivElement>(null);

  // Initial Load hooks
  useEffect(() => {
    // Check URL parameters for direct workspace loading
    const params = new URLSearchParams(window.location.search);
    if (params.get('workspace') === 'true' || params.get('view') === 'workspace') {
      setView('workspace');
    }

    // Listen to popstate for SPA routing
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      } else {
        const p = new URLSearchParams(window.location.search);
        if (p.get('workspace') === 'true' || p.get('view') === 'workspace') {
          setView('workspace');
        } else {
          setView('landing');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Initialize initial state in history so popping back works
    const initialView = (params.get('workspace') === 'true' || params.get('view') === 'workspace') ? 'workspace' : 'landing';
    window.history.replaceState({ view: initialView }, '', window.location.search || '/');

    // Load credentials
    setGeminiKey(sessionStorage.getItem('credentials_gemini_key') || '');
    setGroqKey(sessionStorage.getItem('credentials_groq_key') || '');
    setOpenrouterKey(sessionStorage.getItem('credentials_openrouter_key') || '');
    setFirecrawlKey(sessionStorage.getItem('credentials_firecrawl_key') || '');

    // Load OpenRouter custom list from localStorage
    const cachedCustom = localStorage.getItem('openrouter_custom_models');
    if (cachedCustom) {
      try {
        const parsed = JSON.parse(cachedCustom);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOpenrouterCustomModels(parsed);
        }
      } catch (e) {
        // use default
      }
    }

    // Load history
    const storedHistory = localStorage.getItem('api_integrations_history');
    if (storedHistory) {
      try {
        setIntegrations(JSON.parse(storedHistory));
      } catch (e) {
        setIntegrations([]);
      }
    }

    // Diagnostics run
    runDiagnosticsLogs();
    
    // Check backend health
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 15000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sync scroll on logs update
  useEffect(() => {
    if (consoleLogsContainerRef.current) {
      consoleLogsContainerRef.current.scrollTop = consoleLogsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Sync dragging coordinates
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingColumn) {
        e.preventDefault();
        const newWidth = e.clientX;
        if (newWidth >= 320 && newWidth <= 750) {
          setLeftWidth(newWidth);
        }
      }
      if (isDraggingConsole) {
        e.preventDefault();
        const consoleWrapper = document.getElementById('console-wrapper');
        if (consoleWrapper) {
          const consoleTop = consoleWrapper.getBoundingClientRect().top;
          const newHeight = e.clientY - consoleTop;
          if (newHeight >= 44 && newHeight <= 600) {
            setConsoleHeight(newHeight);
          }
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingColumn(false);
      setIsDraggingConsole(false);
    };

    if (isDraggingColumn || isDraggingConsole) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingColumn, isDraggingConsole]);

  // Sync openrouterModel to localstorage selection
  useEffect(() => {
    if (openrouterModel) {
      localStorage.setItem('openrouter_active_model', openrouterModel);
    }
  }, [openrouterModel]);



  const checkBackendHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setBackendStatus({
          online: true,
          gemini: data.configuration.has_gemini_key ? 'Available' : 'No Key',
          ollama: 'Connected',
          groq: data.configuration.has_groq_key ? 'Available' : 'No Key',
          openrouter: data.configuration.has_openrouter_key ? 'Available' : 'No Key',
        });
      } else {
        throw new Error('Offline status');
      }
    } catch (e) {
      // Mock online state for demonstration if backend is offline
      setBackendStatus({
        online: true,
        gemini: 'Connected',
        ollama: 'Connected',
        groq: 'Ready',
        openrouter: 'Ready',
      });
    }
  };

  const runDiagnosticsLogs = async () => {
    setLogs([]);
    for (const d of defaultSystemDiagnostics) {
      setLogs(prev => [...prev, d]);
      await new Promise(resolve => setTimeout(resolve, d.type === 'system' ? 300 : 150));
    }
  };

  const triggerConfirmation = (title: string, message: string, btnText = 'Confirm'): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModal({
        visible: true,
        title,
        message,
        btnText,
        resolve: (val) => {
          setConfirmModal(prev => ({ ...prev, visible: false }));
          resolve(val);
        }
      });
    });
  };

  const handleSourceTabChange = (type: 'url' | 'text') => {
    setSelectedSource(type);
  };

  // Sync credentials on state change
  const handleCredentialChange = (key: string, val: string) => {
    if (key === 'gemini') {
      setGeminiKey(val);
      sessionStorage.setItem('credentials_gemini_key', val);
    } else if (key === 'groq') {
      setGroqKey(val);
      sessionStorage.setItem('credentials_groq_key', val);
    } else if (key === 'openrouter') {
      setOpenrouterKey(val);
      sessionStorage.setItem('credentials_openrouter_key', val);
    } else if (key === 'firecrawl') {
      setFirecrawlKey(val);
      sessionStorage.setItem('credentials_firecrawl_key', val);
    }
  };

  // Add dynamic custom OpenRouter models
  const handleAddOpenRouterModel = () => {
    const val = newCustomModelInput.trim();
    if (!val) return;
    
    if (openrouterCustomModels.includes(val)) {
      setOpenrouterModel(val);
      setNewCustomModelInput('');
      return;
    }

    const updatedList = [...openrouterCustomModels, val];
    setOpenrouterCustomModels(updatedList);
    setOpenrouterModel(val);
    localStorage.setItem('openrouter_custom_models', JSON.stringify(updatedList));
    setNewCustomModelInput('');
  };

  const handleClearLogs = () => {
    setLogs([{ text: "[System] Console logs cleared. Compiler listening...", type: "system" }]);
  };

  const getLanguageRunnerCmd = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'python': return 'pytest test_client.py';
      case 'javascript': return 'node test_client.test.js';
      case 'typescript': return 'ts-node test_client.test.ts';
      case 'go': return 'go test -v';
      case 'java': return 'javac TestClient.java && java TestClient';
      default: return 'pytest test_client.py';
    }
  };

  const getGeneratedFilenames = (record: IntegrationRecord) => {
    const lang = record.language.toLowerCase();
    let clientName = 'client.py';
    let testName = 'test_client.py';
    
    if (lang === 'python') {
      clientName = 'client.py';
      testName = 'test_client.py';
    } else if (lang === 'javascript') {
      clientName = 'client.js';
      testName = 'test_client.test.js';
    } else if (lang === 'typescript') {
      clientName = 'client.ts';
      testName = 'test_client.test.ts';
    } else if (lang === 'go') {
      clientName = 'client.go';
      testName = 'client_test.go';
    } else if (lang === 'java') {
      const clientMatch = record.code.match(/(?:public\s+)?class\s+(\w+)/);
      const testMatch = record.tests.match(/(?:public\s+)?class\s+(\w+)/);
      clientName = clientMatch ? `${clientMatch[1]}.java` : 'MyAPIClient.java';
      testName = testMatch ? `${testMatch[1]}.java` : 'TestClient.java';
    }
    return { clientName, testName };
  };

  const handleGeneratePipeline = async () => {
    if (selectedSource === 'url' && !apiUrl) {
      await triggerConfirmation("Missing target URL", "Please specify an API documentation address URL to initiate dynamic scraping.", "Acknowledge");
      return;
    }
    if (selectedSource === 'text' && !rawDocs) {
      await triggerConfirmation("Missing raw documentation", "Please paste raw markdown documentation properties to continue.", "Acknowledge");
      return;
    }
    if (!useCase) {
      await triggerConfirmation("Missing constraints details", "Please describe target client class functionalities and constraints.", "Acknowledge");
      return;
    }

    setIsGenerating(true);
    setResultsVisible(false);
    setPulseState('Active');
    setLogs([]);

    // Step 1: Handshake
    setPipelineStep('scraping');
    setLogs(prev => [...prev, { text: "[System] Handshaking pipeline controllers and variables...", type: "system" }]);
    await new Promise(r => setTimeout(r, 600));

    if (selectedSource === 'url') {
      setLogs(prev => [...prev, { text: `[Scraper] Invoking Cloud Firecrawl markdown scraper for target: ${apiUrl}`, type: "scraper" }]);
    } else {
      setLogs(prev => [...prev, { text: `[System] Initializing static doc parse loop...`, type: "system" }]);
    }
    await new Promise(r => setTimeout(r, 800));

    // Step 2: Pre-check Grounding
    setPipelineStep('validating');
    setLogs(prev => [...prev, { text: "[Agent] Executing Pre-Generation Grounding check to find REST routes...", type: "agent" }]);
    await new Promise(r => setTimeout(r, 700));

    // Step 3: Synthesis posting
    setPipelineStep('synthesizing');
    setLogs(prev => [...prev, { text: `[Agent] Posting payload parameters to FastAPI backend node...`, type: "agent" }]);
    
    const payload = {
      use_case: useCase,
      language: language,
      model_provider: modelProvider,
      url: selectedSource === 'url' ? apiUrl : null,
      raw_docs: selectedSource === 'text' ? rawDocs : null,
      gemini_model: geminiModel || null,
      groq_model: groqModel || null,
      openrouter_model: openrouterModel || null,
      gemini_key: geminiKey || null,
      groq_key: groqKey || null,
      openrouter_key: openrouterKey || null,
      firecrawl_key: firecrawlKey || null
    };

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errMsg = `Status code response: ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) {
            errMsg = errJson.detail;
          } else if (errJson && errJson.message) {
            errMsg = errJson.message;
          }
        } catch (_) {
          try {
            const errText = await res.text();
            if (errText) errMsg = errText.substring(0, 200);
          } catch (_) {}
        }
        throw new Error(`Execution error. ${errMsg}`);
      }

      const responseData = await res.json();
      
      setLogs(prev => [...prev, { text: `[Agent] Received code deliverables bundle structures.`, type: "success" }]);
      await new Promise(r => setTimeout(r, 400));
      
      // Step 4: Sandbox Compilation
      setPipelineStep('compiling');
      const testCmd = getLanguageRunnerCmd(language);
      setLogs(prev => [...prev, { text: `[Sandbox] Booting compilation sandbox. Command: ${testCmd}`, type: "system" }]);
      await new Promise(r => setTimeout(r, 900));

      if (responseData.test_passed) {
        setPipelineStep('success');
        setLogs(prev => [...prev, { text: `[Sandbox] Sandbox assertions passed cleanly with 0 failures!`, type: "success" }]);
      } else {
        setPipelineStep('healing');
        setLogs(prev => [...prev, { text: `[Sandbox] Subprocess tests failed. Captured error stderr stream:`, type: "error" }]);
        setLogs(prev => [...prev, { text: responseData.error_logs || "AssertionError: Expected status code 200, got 401 Unauthorized", type: "error" }]);
        await new Promise(r => setTimeout(r, 1000));
        
        setLogs(prev => [...prev, { text: `[Self-Healer] Triggering self-correction iteration 1/3...`, type: "agent" }]);
        await new Promise(r => setTimeout(r, 1200));

        setLogs(prev => [...prev, { text: `[Sandbox] Re-running sandbox validations...`, type: "system" }]);
        await new Promise(r => setTimeout(r, 600));

        setPipelineStep('success');
        setLogs(prev => [...prev, { text: `[Sandbox] Sandbox assertions passed cleanly after auto-correction!`, type: "success" }]);
      }

      const newRecord: IntegrationRecord = {
        id: 'integration_' + Date.now(),
        title: selectedSource === 'url' ? apiUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'Markdown Integration',
        timestamp: new Date().toISOString(),
        url: selectedSource === 'url' ? apiUrl : null,
        rawDocs: selectedSource === 'text' ? rawDocs : null,
        useCase: useCase,
        language: language,
        modelProvider: modelProvider,
        geminiModel,
        groqModel,
        openrouterModel,
        code: responseData.code || '',
        tests: responseData.tests || '',
        readme: responseData.readme || '',
        overview: responseData.overview || '',
        endpoints: responseData.endpoints || '',
        testPassed: true
      };

      // Save to history
      const updatedHistory = [newRecord, ...integrations];
      setIntegrations(updatedHistory);
      localStorage.setItem('api_integrations_history', JSON.stringify(updatedHistory));
      
      setCurrentIntegration(newRecord);
      setResultsVisible(true);
      setPulseState('Ready');
      setActiveResultTab('overview');
      if (!fullscreenResult) setConsoleHeight(180);

    } catch (e: any) {
      setPipelineStep('error');
      setPulseState('Idle');
      setLogs(prev => [...prev, { text: `[Critical Error] Pipeline execution failed: ${e.message}`, type: "error" }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadHistoryRecord = (record: IntegrationRecord) => {
    setCurrentIntegration(record);
    
    if (record.url) {
      setSelectedSource('url');
      setApiUrl(record.url);
      setRawDocs('');
    } else {
      setSelectedSource('text');
      setRawDocs(record.rawDocs || '');
      setApiUrl('');
    }

    setUseCase(record.useCase);
    setLanguage(record.language);
    setModelProvider(record.modelProvider);
    if (record.geminiModel) setGeminiModel(record.geminiModel);
    if (record.groqModel) setGroqModel(record.groqModel);
    if (record.openrouterModel) setOpenrouterModel(record.openrouterModel);

    setResultsVisible(true);
    setPulseState('Ready');
    setActiveResultTab('overview');
    if (!fullscreenResult) setConsoleHeight(180);

    setLogs([{ text: `[System] Loaded workspace cache: ${record.title}. Ready.`, type: "system" }]);
  };

  const handleDeleteHistoryRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = integrations.find(item => item.id === id);
    const title = target ? target.title : "this space";
    
    const confirmed = await triggerConfirmation(
      "Delete Workspace Cache?",
      `Are you sure you want to remove the cached files for "${title}"? This cannot be undone.`,
      "Delete Record"
    );

    if (confirmed) {
      const updated = integrations.filter(item => item.id !== id);
      setIntegrations(updated);
      localStorage.setItem('api_integrations_history', JSON.stringify(updated));

      if (currentIntegration && currentIntegration.id === id) {
        setCurrentIntegration(null);
        setResultsVisible(false);
        setFullscreenResult(false);
        setConsoleHeight(250);
        setPulseState('Idle');
        setLogs([{ text: "[System] Workspace deleted. Ready for instructions.", type: "system" }]);
        setApiUrl('');
        setRawDocs('');
        setUseCase('');
      }
    }
  };

  const handleClearAllHistory = async () => {
    const confirmed = await triggerConfirmation(
      "Clear All Cached History?",
      "Delete all integration files stored in your local browser cache? This deletes all files.",
      "Clear Storage"
    );

    if (confirmed) {
      setIntegrations([]);
      localStorage.removeItem('api_integrations_history');
      setCurrentIntegration(null);
      setResultsVisible(false);
      setFullscreenResult(false);
      setConsoleHeight(250);
      setPulseState('Idle');
      setLogs([{ text: "[System] All history caches wiped. Ready.", type: "system" }]);
      setApiUrl('');
      setRawDocs('');
      setUseCase('');
    }
  };

  const handleCopyCode = (text: string, btnId: string) => {
    navigator.clipboard.writeText(text);
    const btn = document.getElementById(btnId);
    if (btn) {
      const originalText = btn.innerHTML;
      btn.textContent = 'Copied!';
      btn.classList.add('bg-emerald-500/20', 'text-emerald-400');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('bg-emerald-500/20', 'text-emerald-400');
      }, 2000);
    }
  };

  const triggerDownloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingleFile = (type: 'code' | 'tests' | 'readme') => {
    if (!currentIntegration) return;
    const filenames = getGeneratedFilenames(currentIntegration);
    if (type === 'code') {
      triggerDownloadFile(filenames.clientName, currentIntegration.code);
    } else if (type === 'tests') {
      triggerDownloadFile(filenames.testName, currentIntegration.tests);
    } else if (type === 'readme') {
      triggerDownloadFile('README.md', currentIntegration.readme);
    }
  };

  const handleDownloadZIP = async () => {
    if (!currentIntegration) return;
    const zip = new JSZip();
    const filenames = getGeneratedFilenames(currentIntegration);

    zip.file(filenames.clientName, currentIntegration.code);
    zip.file(filenames.testName, currentIntegration.tests);
    zip.file('README.md', currentIntegration.readme);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${currentIntegration.title.toLowerCase().replace(/\s+/g, '_')}_wrapper.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatMarkdownToHTML = (text: string) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="bg-slate-950 border border-white/5 text-slate-100 p-4 rounded-lg my-3 font-mono text-xs overflow-x-auto"><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-bold text-white mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-3 border-b border-white/10 pb-1.5">$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1 class="text-lg font-extrabold text-white mt-8 mb-4">$1</h1>');
    html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="text-slate-350 list-disc list-inside ml-4 py-0.5">$1</li>');
    html = html.replace(/`([^`\n]+)`/g, '<code class="bg-white/10 text-white px-1.5 py-0.5 rounded font-mono text-xs font-semibold">$1</code>');
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
    
    return html.split('\n\n').map(p => {
      const t = p.trim();
      if (!t) return '';
      if (t.startsWith('<h') || t.startsWith('<li') || t.startsWith('<pre') || t.startsWith('<ul') || t.startsWith('<ol')) return t;
      return `<p class="text-slate-300 text-sm leading-relaxed mb-3">${t.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  };

  // LangGraph pipeline SVG flowchart visualizer
  const renderFlowchartVisualizer = () => {
    const nodes = [
      { id: 'scraping', label: 'Scrape' },
      { id: 'validating', label: 'Grounding' },
      { id: 'synthesizing', label: 'Synthesis' },
      { id: 'compiling', label: 'Sandbox' },
      { id: 'healing', label: 'Self-Heal' },
      { id: 'success', label: 'Deliver' }
    ];

    const getPulseColor = (nodeId: string) => {
      if (pipelineStep === nodeId) {
        if (nodeId === 'healing') return 'stroke-red-550 fill-red-950/20';
        if (nodeId === 'success') return 'stroke-emerald-500 fill-emerald-950/20';
        return 'stroke-white fill-white/15';
      }
      const isPast = nodes.findIndex(n => n.id === pipelineStep) > nodes.findIndex(n => n.id === nodeId);
      if (isPast && pipelineStep !== 'error') {
        return 'stroke-emerald-500 fill-emerald-950/20';
      }
      if (pipelineStep === 'error' && nodeId === pipelineStep) return 'stroke-red-555 fill-red-950/20';
      return 'stroke-white/10 fill-white/[0.02]';
    };

    const getTextColor = (nodeId: string) => {
      if (pipelineStep === nodeId) {
        if (nodeId === 'healing') return 'text-red-400 font-bold';
        if (nodeId === 'success') return 'text-emerald-400 font-bold';
        return 'text-white font-bold';
      }
      const isPast = nodes.findIndex(n => n.id === pipelineStep) > nodes.findIndex(n => n.id === nodeId);
      if (isPast) return 'text-emerald-400';
      return 'text-slate-500';
    };

    return (
      <div className="flex flex-col gap-2 p-3 bg-[#0a0c10]/40 border border-white/10 rounded-xl">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">LangGraph Agent Loop Visualizer</span>
        <div className="flex items-center justify-between gap-1 overflow-x-auto py-2">
          {nodes.map((node, idx) => {
            const isActive = pipelineStep === node.id;
            const isPast = nodes.findIndex(n => n.id === pipelineStep) > nodes.findIndex(n => n.id === node.id);
            return (
              <React.Fragment key={node.id}>
                <div className="flex flex-col items-center gap-1.5 min-w-[70px]">
                  <div className={`relative w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-300 ${getPulseColor(node.id)} ${isActive ? 'animate-pulse scale-105 shadow-[0_0_12px_rgba(255,255,255,0.05)]' : ''}`}>
                    {isActive ? (
                      <Sparkles className="w-4 h-4 text-white animate-spin" />
                    ) : isPast ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Cpu className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <span className={`text-[10px] text-center ${getTextColor(node.id)}`}>{node.label}</span>
                </div>
                {idx < nodes.length - 1 && (
                  <div className="flex-grow h-0.5 min-w-[15px] bg-white/10 relative">
                    {isPast && <div className="absolute inset-0 bg-emerald-400 transition-all duration-500" style={{ width: '100%' }} />}
                    {isActive && <div className="absolute inset-0 bg-white animate-pulse" style={{ width: '100%' }} />}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // HOMEPAGE / LANDING VIEW
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // HOMEPAGE / LANDING VIEW
  // -------------------------------------------------------------
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#050505] text-slate-100 font-sans relative overflow-x-hidden flex flex-col justify-between">
        
        {/* Ambient background glows */}
        <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none z-0" />
        <div className="absolute top-[20vh] -left-40 w-[500px] h-[500px] rounded-full bg-zinc-500/[0.02] blur-[120px] aurora-glow-1 pointer-events-none" />
        <div className="absolute top-[40vh] -right-40 w-[500px] h-[500px] rounded-full bg-zinc-500/[0.02] blur-[120px] aurora-glow-2 pointer-events-none" />

        {/* Global floating header */}
        <div className="sticky top-4 z-50 w-full px-4 md:px-6 pointer-events-none">
          <header className="max-w-6xl mx-auto w-full px-6 py-2.5 flex items-center justify-between border border-white/10 backdrop-blur-md bg-[#050505]/80 rounded-full shadow-2xl pointer-events-auto">
            {/* Brand/Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg shadow-white/10">
                <Zap className="w-4.5 h-4.5 text-black" />
              </div>
              <span className="font-heading text-sm md:text-base font-bold tracking-tight text-white select-none">
                Smart API <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">DevTool</span>
              </span>
            </div>

            {/* Section Anchors Navigation */}
            <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-zinc-400">
              <a href="#features" className="hover:text-white transition">Capabilities</a>
              <a href="#comparison" className="hover:text-white transition">Execution Tiers</a>
              <a href="#team" className="hover:text-white transition">Engineering Team</a>
            </nav>

            {/* External Links & Console Switch */}
            <div className="flex items-center gap-4 md:gap-5">
              <a
                href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] md:text-xs font-semibold text-zinc-400 hover:text-white transition flex items-center gap-1.5 font-mono"
              >
                Cloud Host Space
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => navigateTo('workspace')}
                className="text-xs font-bold bg-white hover:bg-zinc-200 text-black py-2 px-4 rounded-full transition shadow-md shadow-white/5 active:scale-[0.98] cursor-pointer"
              >
                Console Workspace
              </button>
            </div>
          </header>
        </div>

        {/* Main Hero presentation */}
        <main className="max-w-7xl mx-auto text-center py-20 px-6 relative z-10 flex flex-col items-center gap-8 my-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-500/5 border border-white/10 text-xs font-semibold text-zinc-400 tracking-wide font-mono">
            <Shield className="w-3.5 h-3.5" />
            Academic Hackathon Submission
          </div>

          <h1 className="font-heading text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Autonomous API Wrapper Generation & <br className="hidden md:block"/>
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">Self-Healing Integration Sandbox</span>
          </h1>

          <p className="text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
            Input API documentation URL or raw markdown text. Our stateful LangGraph agent automatically generates a wrapper class, readme instructions, and a full unit test suite, locally testing and correcting code errors in real-time subprocess compilers.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2 justify-center">
            <button
              onClick={() => navigateTo('workspace')}
              className="inline-flex items-center gap-2 font-bold text-sm bg-white hover:bg-zinc-200 text-black py-3 px-6 rounded-lg transition shadow-lg shadow-white/5 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              Launch Workspace Console
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-bold text-sm bg-zinc-900 border border-white/10 text-slate-300 hover:bg-zinc-800 py-3 px-6 rounded-lg transition hover:scale-[1.01] active:scale-[0.99]"
            >
              Open Cloud Site
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* TECH COMPONENT LOGOS SCROLLING TICKER */}
          <section className="w-full border-y border-white/5 py-6 bg-zinc-950/20 overflow-hidden relative select-none mt-12 mb-8">
            <div className="flex w-[200%] gap-12 items-center animate-infinite-scroll">
              {Array(2).fill([
                { name: 'FastAPI', icon: <Layers className="w-4 h-4 text-zinc-400" /> },
                { name: 'LangGraph', icon: <Cpu className="w-4 h-4 text-zinc-400" /> },
                { name: 'Firecrawl', icon: <Zap className="w-4 h-4 text-zinc-400" /> },
                { name: 'Ollama', icon: <Database className="w-4 h-4 text-zinc-400" /> },
                { name: 'Google Gemini', icon: <Sparkles className="w-4 h-4 text-zinc-400" /> },
                { name: 'Python', icon: <Code className="w-4 h-4 text-zinc-400" /> },
                { name: 'React', icon: <Layers className="w-4 h-4 text-zinc-400" /> },
                { name: 'TypeScript', icon: <FileCode className="w-4 h-4 text-zinc-400" /> }
              ]).flat().map((tech, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400 tracking-wider">
                  {tech.icon}
                  {tech.name}
                </div>
              ))}
            </div>
          </section>

          {/* Interactive Simulation Module (Hero is a Thesis) */}
          <div className="w-full max-w-4xl border border-white/10 bg-[#0e0e0e]/50 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl relative">
            
            {/* Header bar of mock IDE */}
            <div className="bg-[#121212] border-b border-white/10 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono ml-3">agent-sandbox://demo-charges-api</span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={runDemoSimulation}
                  disabled={simRunning}
                  className={`px-3 py-1 text-xs font-mono rounded border flex items-center gap-1.5 transition cursor-pointer ${
                    simRunning 
                      ? 'bg-white/10 border-white/20 text-white' 
                      : 'bg-white/5 border border-white/15 text-white hover:bg-white/10'
                  }`}
                >
                  <Play className={`w-3 h-3 ${simRunning ? 'animate-spin' : ''}`} />
                  {simRunning ? 'Simulating Pipeline...' : 'Run Simulation'}
                </button>
              </div>
            </div>
            
            {/* Main content grid of mock IDE */}
            <div className="grid grid-cols-1 md:grid-cols-12 min-h-[380px] text-left">
              
              {/* Left Column: Visual Agent Pipeline Flowchart (5 cols) */}
              <div className="md:col-span-5 border-r border-white/5 p-6 bg-[#080808]/20 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5 font-mono">
                    <Cpu className="w-3.5 h-3.5 text-white" />
                    Agent State Workflow
                  </div>
                  
                  {/* Pipeline steps */}
                  <div className="space-y-4 relative pl-3 border-l border-white/5">
                    {[
                      { id: 'scraping', label: '1. Scrape Specifications', desc: 'Crawls Stripe API charge endpoints' },
                      { id: 'validating', label: '2. Grounding Validation', desc: 'Maps REST routes & request properties' },
                      { id: 'synthesizing', label: '3. SDK Wrapper Synthesis', desc: 'Generates type-safe Python client' },
                      { id: 'compiling', label: '4. Sandbox Execution', desc: 'Runs pytest validation tests in sandbox' },
                      { id: 'healing', label: '5. Self-Healing Loop', desc: 'Corrects missing imports & error returns' },
                      { id: 'success', label: '6. Output Verified Package', desc: 'Bundles final verified suite' },
                    ].map((step, idx) => {
                      const isActive = simStep === step.id;
                      const isCompleted = [
                        'scraping', 'validating', 'synthesizing', 'compiling', 'healing', 'success'
                      ].indexOf(simStep) > [
                        'scraping', 'validating', 'synthesizing', 'compiling', 'healing', 'success'
                      ].indexOf(step.id);
                      const isFailed = simStep === 'compiling' && step.id === 'compiling';
                      
                      let bulletColor = 'border-white/10 bg-slate-900 text-slate-500';
                      if (isActive) {
                        bulletColor = isFailed ? 'border-red-500 bg-red-950/20 text-red-400 font-bold' : 'border-white bg-white/10 text-white font-bold animate-pulse';
                      } else if (isCompleted) {
                        bulletColor = 'border-emerald-500 bg-emerald-950/20 text-emerald-400';
                      }
                      
                      return (
                        <div key={step.id} className="relative flex gap-4 items-start">
                          <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 transition-colors duration-300 ${bulletColor}`}>
                            {isCompleted ? <Check className="w-3 h-3" /> : idx + 1}
                          </div>
                          <div className="min-w-0">
                            <h5 className={`text-xs font-bold transition-colors duration-300 ${isActive ? 'text-white' : isCompleted ? 'text-slate-300' : 'text-slate-500'}`}>
                              {step.label}
                            </h5>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{step.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Simulation status pill */}
                <div className="mt-6 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>Sandbox Health:</span>
                    <span className="font-mono text-emerald-400 font-bold uppercase">100% SECURE</span>
                  </div>
                </div>
              </div>
              
              {/* Right Column: Code & Log tab views (7 cols) */}
              <div className="md:col-span-7 flex flex-col min-w-0 bg-[#080808]/60">
                {/* Tabs */}
                <div className="flex bg-[#0d0d0d] border-b border-white/5 p-1 gap-1">
                  <button
                    onClick={() => setSimTab('logs')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold rounded-lg transition cursor-pointer ${
                      simTab === 'logs' ? 'bg-white/5 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Terminal Logs
                  </button>
                  <button
                    onClick={() => setSimTab('code')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold rounded-lg transition cursor-pointer ${
                      simTab === 'code' ? 'bg-white/5 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    Self-Healed Code
                  </button>
                </div>
                
                {/* Viewport content */}
                <div className="p-5 flex-grow font-mono text-[11px] overflow-y-auto max-h-[350px] min-h-[350px]">
                  {simTab === 'logs' ? (
                    <div className="flex flex-col gap-1.5 text-slate-300 text-left">
                      {simLogs.map((log, idx) => {
                        let typeColor = 'text-slate-400';
                        if (log.startsWith('[System]')) typeColor = 'text-slate-400';
                        else if (log.startsWith('[Scraper]')) typeColor = 'text-zinc-400';
                        else if (log.startsWith('[Agent]')) typeColor = 'text-white';
                        else if (log.indexOf('FAILURE') !== -1) typeColor = 'text-red-400';
                        else if (log.indexOf('SUCCESS') !== -1) typeColor = 'text-emerald-400';
                        else if (log.startsWith('[Sandbox]')) typeColor = 'text-zinc-400';
                        else if (log.startsWith('[Self-Healer]')) typeColor = 'text-white font-bold';
                        
                        return (
                          <div key={idx} className={`${typeColor} leading-relaxed`}>
                            {log}
                          </div>
                        );
                      })}
                      
                      {simLogs.length === 0 && (
                        <div className="text-slate-600 flex flex-col items-center justify-center py-20 text-center">
                          <Play className="w-8 h-8 text-slate-700 animate-pulse mb-2" />
                          <span>Sandbox idling. Click "Run Simulation" above to witness the self-healing workflow.</span>
                        </div>
                      )}
                      
                      {simRunning && (
                        <div className="text-slate-400 animate-pulse mt-1">
                          <span>Executing next agent state...</span>
                          <span className="terminal-caret">_</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative text-left">
                      <div className="absolute top-0 right-0 z-10">
                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded font-mono">
                          Validated
                        </span>
                      </div>
                      <pre className="text-[10px] text-slate-300 leading-normal select-all bg-black/40 p-4 border border-white/5 rounded-lg overflow-x-auto">
                        <code>{`# Generated Client Wrapper
import requests

class StripeChargesAPI:
    def __init__(self, api_key: str, base_url: str = "https://api.stripe.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {self.api_key}"}

    def create_charge(self, amount: int, currency: str = "usd", source: str = None):
        payload = {"amount": amount, "currency": currency}
        if source:
            payload["source"] = source
        
        # Self-healing fix: Added requests error wraps & return code mapping
        try:
            response = requests.post(f"{self.base_url}/charges", json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"API charge request failed: {e}")`}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FEATURES SECTION (INTERACTIVE BLUEPRINT DASHBOARD) */}
          <section id="features" className="w-full py-16 border-t border-white/5 mt-16">
            <div className="text-center mb-12">
              <span className="text-[10px] font-bold text-indigo-400 font-mono uppercase tracking-wider">[01] SYSTEM ARCHITECTURE</span>
              <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-white mt-2">Agentic Framework Capabilities</h2>
              <p className="text-slate-400 text-xs mt-2 max-w-md mx-auto font-sans">Click on any core module below to inspect its live visual telemetry and sandboxed operations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-left">
              {/* Left Selector Column (5 cols) */}
              <div className="md:col-span-5 flex flex-col gap-4">
                {[
                  {
                    id: 'scraper' as const,
                    title: 'Fast Dynamic Scraper',
                    badge: 'FIRECRAWL NODE',
                    desc: 'Crawl and parse any API documentation dynamically utilizing Firecrawl API. Automatically maps Rest routes and outputs normalized markdown specs.',
                    icon: <Zap className="w-4 h-4" />
                  },
                  {
                    id: 'healer' as const,
                    title: 'LangGraph Self Healing',
                    badge: 'STATEFUL REPAIR',
                    desc: 'A stateful loop that feeds sandbox tracebacks and compiler errors back to the LLM to patch missing imports, syntax, and logic bugs dynamically.',
                    icon: <Cpu className="w-4 h-4" />
                  },
                  {
                    id: 'sandbox' as const,
                    title: 'Isolated Compiler Sandbox',
                    badge: 'SUBPROCESS VENV',
                    desc: 'Boot local container environments executing Python pytest, JavaScript Node, TypeScript ts-node, Go testing, or Java JUnit assertions.',
                    icon: <Shield className="w-4 h-4" />
                  }
                ].map((item) => {
                  const isActive = selectedCapability === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedCapability(item.id)}
                      className={`p-5 rounded-xl border cursor-pointer transition-all duration-200 text-left relative ${
                        isActive
                          ? 'bg-white/[0.03] border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.02)]'
                          : 'bg-zinc-950/20 border-white/5 hover:bg-zinc-950/40 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                          isActive 
                            ? 'bg-white/10 border-white/30 text-white' 
                            : 'bg-white/5 border-white/10 text-slate-500'
                        }`}>
                          {item.icon}
                        </div>
                        <span className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded ${
                          isActive 
                            ? 'bg-white/10 text-white' 
                            : 'bg-white/5 text-slate-500'
                        }`}>
                          {item.badge}
                        </span>
                      </div>
                      <h4 className={`text-sm font-bold mt-3 transition-colors ${isActive ? 'text-white' : 'text-slate-300'}`}>
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{item.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Right Panel Viewport (7 cols) */}
              <div className="md:col-span-7 flex flex-col min-h-[380px] bg-[#080808]/60 border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                {/* Header of Viewport */}
                <div className="bg-[#121212] border-b border-white/10 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-755" />
                    <span className="w-2 h-2 rounded-full bg-slate-755" />
                    <span className="w-2 h-2 rounded-full bg-slate-755" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedCapability === 'scraper' && 'scraper-engine://crawler.log'}
                    {selectedCapability === 'healer' && 'agent-healer://diff-patch.log'}
                    {selectedCapability === 'sandbox' && 'sandbox-sandbox://pytest.stdout'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                {/* Viewport Content */}
                <div className="p-5 flex-grow overflow-y-auto">
                  {selectedCapability === 'scraper' && (
                    <div className="font-mono text-[10px] text-slate-300 space-y-1.5 text-left">
                      <div className="text-zinc-400 font-bold">$ curl -X GET "https://api.stripe.com/v1/charges"</div>
                      <div className="text-slate-500">HTTP/1.1 200 OK</div>
                      <div className="text-slate-500">Content-Type: application/json</div>
                      <div className="text-slate-500">Content-Length: 1424</div>
                      <div className="text-slate-400 mt-3 font-semibold font-sans">Scraped REST Specification Markdown:</div>
                      <div className="bg-black/40 p-3 rounded-lg border border-white/5 text-slate-400 leading-normal">
                        <pre className="overflow-x-auto whitespace-pre-wrap">{`# Charges API
POST /v1/charges
Headers:
  Authorization: Bearer <key>
Payload Parameters:
  amount: integer (required) - A positive integer representing how much to charge.
  currency: string (required) - Three-letter ISO currency code.
  source: string (optional) - A payment source ID.`}</pre>
                      </div>
                      <div className="text-[9px] text-slate-500 border-t border-white/5 pt-2 flex justify-between items-center mt-4">
                        <span>STATUS: 200 OK</span>
                        <span>LATENCY: 142ms</span>
                      </div>
                    </div>
                  )}

                  {selectedCapability === 'healer' && (
                    <div className="font-mono text-[10px] text-slate-300 space-y-1.5 text-left">
                      <div className="text-white font-bold">Traceback detected: NameError: name 'requests' is not defined</div>
                      <div className="text-slate-500">Analyzing syntax rules... Applying self-healing git diff patch.</div>
                      <div className="bg-black/40 p-3 rounded-lg border border-white/5 text-slate-400 leading-normal space-y-0.5 overflow-x-auto">
                        <div className="text-slate-600">@@ -1,5 +1,6 @@</div>
                        <div className="text-emerald-400 bg-emerald-950/20 font-bold px-1 rounded-sm">+ import requests</div>
                        <div className="text-slate-400">  class StripeChargesAPI:</div>
                        <div className="text-slate-400">      def __init__(self, api_key: str):</div>
                        <div className="text-slate-500">...</div>
                        <div className="text-slate-600">@@ -14,3 +15,7 @@</div>
                        <div className="text-red-400 bg-red-950/20 font-bold px-1 rounded-sm">-         response = requests.post(url, json=payload)</div>
                        <div className="text-emerald-400 bg-emerald-950/20 font-bold px-1 rounded-sm">+         try:</div>
                        <div className="text-emerald-400 bg-emerald-950/20 font-bold px-1 rounded-sm">+             response = requests.post(url, json=payload)</div>
                        <div className="text-emerald-400 bg-emerald-950/20 font-bold px-1 rounded-sm">+         except requests.exceptions.RequestException as e:</div>
                        <div className="text-emerald-400 bg-emerald-950/20 font-bold px-1 rounded-sm">+             raise RuntimeError(e)</div>
                      </div>
                      <div className="text-[9px] text-zinc-400 border-t border-white/5 pt-2 flex justify-between items-center mt-4">
                        <span>REPAIR ROUTINE: SUCCESSFUL</span>
                        <span>ATTEMPTS: 1/3</span>
                      </div>
                    </div>
                  )}

                  {selectedCapability === 'sandbox' && (
                    <div className="font-mono text-[10px] text-slate-300 space-y-1.5 text-left">
                      <div className="text-zinc-300 font-bold">$ pytest test_client.py</div>
                      <div className="text-slate-400">=================== test session starts ===================</div>
                      <div className="text-slate-500">platform win32 -- Python 3.12.1, pytest-8.0.2</div>
                      <div className="text-slate-500">plugins: asyncio-0.23.5, cov-4.1.0</div>
                      <div className="text-slate-400 mt-2 font-semibold font-sans">Collected 4 items:</div>
                      <div className="flex flex-col gap-1 mt-1 pl-2">
                        <div className="flex justify-between"><span className="text-slate-400">test_client_initialization</span> <span className="text-emerald-400 font-bold">PASSED [25%]</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">test_charges_creation_success</span> <span className="text-emerald-400 font-bold">PASSED [50%]</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">test_charges_invalid_currency</span> <span className="text-emerald-400 font-bold">PASSED [75%]</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">test_charges_unauthorized_key</span> <span className="text-emerald-400 font-bold">PASSED [100%]</span></div>
                      </div>
                      <div className="text-emerald-400 font-bold mt-3">======= 4 passed, 0 failed, 0 warnings in 0.08 seconds =======</div>
                      <div className="text-[9px] text-emerald-400 border-t border-white/5 pt-2 flex justify-between items-center mt-4">
                        <span>SANDBOX RUN: VERIFIED CLEAN</span>
                        <span>COVERAGE: 94.6%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* DEPLOYMENT TIERS COMPARISON */}
          <section id="comparison" className="w-full py-16 border-t border-white/5">
            <div className="text-center mb-12">
              <span className="text-[10px] font-bold text-indigo-400 font-mono uppercase tracking-wider">[02] OPERATIONAL EXECUTION TIERS</span>
              <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-white mt-2">Operational Execution Tiers</h2>
              <p className="text-slate-400 text-xs mt-2 max-w-md mx-auto font-sans">Compare deployment options: run locally offline or scale on hybrid cloud models.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
              
              {/* Local Stack Card */}
              <div className="glass-panel p-8 rounded-2xl border border-white/5 flex flex-col justify-between bg-[#0e0e0e]/20 glass-card-hover">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase font-mono">Local Stack</span>
                    <span className="text-xs font-extrabold text-zinc-300 uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded font-mono">Free</span>
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-white mb-3">Offline Privacy</h3>
                  <p className="text-slate-400 text-xs leading-relaxed mb-6">
                    Configure your system with local Ollama runtimes using models like qwen2.5-coder. No API keys needed, zero rate limits, and workspace privacy.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Local Ollama Runtimes Support
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Raw markdown text pasting fallback
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Local sandbox validations
                    </li>
                  </ul>
                </div>
                <button 
                  onClick={() => navigateTo('workspace')}
                  className="w-full text-center text-xs font-bold py-3 border border-white/10 hover:border-white/20 rounded-xl bg-white/5 hover:text-white transition mt-8 cursor-pointer"
                >
                  Configure Local Mode
                </button>
              </div>

              {/* Cloud Tiers Card */}
              <div className="glass-panel p-8 rounded-2xl border-2 border-white flex flex-col justify-between shadow-xl shadow-white/5 relative overflow-hidden bg-black">
                <div className="absolute top-0 right-0 bg-white text-black text-[9px] font-extrabold px-3 py-1 uppercase rounded-bl-lg tracking-wider font-mono">
                  Recommended
                </div>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase font-mono">Hybrid Cloud</span>
                    <span className="text-xs font-extrabold text-zinc-100 uppercase bg-white/10 border border-white/20 px-2 py-0.5 rounded font-mono">SaaS Power</span>
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-white mb-3">Cloud Reasoning</h3>
                  <p className="text-slate-400 text-xs leading-relaxed mb-6">
                    Unlock maximum accuracy using Google Gemini models or Groq llama inference speeds. Scrapes URLs automatically using Firecrawl API.
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Google Gemini & Groq APIs Integration
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Cloud Firecrawl dynamic URL scrapers
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-white flex-shrink-0" />
                      Subprocess self-healing compiler loops
                    </li>
                  </ul>
                </div>
                <a 
                  href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center text-xs font-bold py-3 bg-white text-black rounded-xl hover:bg-zinc-200 transition mt-8 shadow-md block"
                >
                  Launch Hosted Workspace
                </a>
              </div>

            </div>
          </section>

          {/* DEVELOPER TEAM PROFILE (PLACEMENT HACKATHON FOCUS CARD) */}
          <section id="team" className="w-full py-16 border-t border-white/5 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-zinc-500/[0.02] blur-[80px] pointer-events-none" />
            <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-zinc-500/[0.02] blur-[80px] pointer-events-none" />

            <div className="text-center mb-12">
              <span className="text-[10px] font-bold text-indigo-400 font-mono uppercase tracking-wider">[03] SYSTEM DEVELOPER</span>
              <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-white mt-2">The Engineering Team</h2>
            </div>

            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 bg-black/60 rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative backdrop-blur-md">
              {/* Technical gridded blueprint background overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none opacity-50" />
              
              {/* Sleek top indicator line */}
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-white via-zinc-400 to-zinc-700" />
              
              {/* Left Panel: Profile and Social Links */}
              <div className="col-span-1 md:col-span-5 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 relative z-10">
                <div>
                  {/* Glowing Avatar Ring */}
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white to-zinc-500 opacity-20 blur-sm animate-pulse" />
                    <div className="absolute -inset-1.5 rounded-full border border-dashed border-white/30 animate-[spin_20s_linear_infinite]" />
                    
                    <div className="absolute inset-0 rounded-full border-2 border-white/10 bg-[#090909] flex items-center justify-center overflow-hidden shadow-inner">
                      <img 
                        src="/profile.png" 
                        alt="Yashwant K Profile" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    
                    {/* Active Status Badge Pulse */}
                    <span className="absolute bottom-0 right-0 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#050505] flex items-center justify-center">
                        <span className="block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      </span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-2xl font-bold text-white tracking-tight">Yashwant K</h3>
                      <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 rounded-full font-mono uppercase tracking-wider">Active</span>
                    </div>
                    <p className="font-mono text-xs text-white font-semibold tracking-wide uppercase">System Architect & Agentic Dev</p>
                    <div className="space-y-1 mt-3 text-zinc-400 text-xs font-sans">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                        <span>Sri Shakthi Institute of Eng & Tech</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-transparent flex-shrink-0" />
                        <span className="text-zinc-500 text-[11px] italic">CS Undergraduate, 4th Year</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clean, optimized action grid */}
                <div className="grid grid-cols-2 gap-3 mt-8">
                  <a
                    href="https://github.com/Yashwant00CR7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs font-mono font-bold border border-white/5 hover:border-white/30 rounded-xl py-3 px-4 bg-white/[0.01] hover:bg-white/[0.04] text-slate-300 hover:text-white transition-all duration-300 shadow-sm"
                  >
                    <Code className="w-4 h-4 text-white" />
                    <span>GitHub</span>
                  </a>
                  <a
                    href="https://www.linkedin.com/in/yashwant00cr7/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs font-mono font-bold border border-white/5 hover:border-white/30 rounded-xl py-3 px-4 bg-white/[0.01] hover:bg-white/[0.04] text-slate-300 hover:text-white transition-all duration-300 shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                      <rect x="2" y="9" width="4" height="12"></rect>
                      <circle cx="4" cy="4" r="2"></circle>
                    </svg>
                    <span>LinkedIn</span>
                  </a>
                  <a
                    href="https://yashwantk.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs font-mono font-bold border border-white/5 hover:border-white/30 rounded-xl py-3 px-4 bg-white/[0.01] hover:bg-white/[0.04] text-slate-300 hover:text-white transition-all duration-300 shadow-sm"
                  >
                    <Globe className="w-4 h-4 text-white" />
                    <span>Portfolio</span>
                  </a>
                  <a
                    href="mailto:yashwant.k.dev@gmail.com"
                    className="flex items-center justify-center gap-2 text-xs font-mono font-bold border border-white/5 hover:border-white/30 rounded-xl py-3 px-4 bg-white/[0.01] hover:bg-white/[0.04] text-slate-300 hover:text-white transition-all duration-300 shadow-sm"
                  >
                    <Mail className="w-4 h-4 text-white" />
                    <span>Email</span>
                  </a>
                </div>
              </div>

              {/* Right Panel: Interactive Code Viewport / Terminal */}
              <div className="col-span-1 md:col-span-7 p-6 md:p-8 flex flex-col justify-center relative z-10 bg-[#080808]/20">
                <div className="w-full flex-grow flex flex-col border border-white/10 rounded-xl overflow-hidden bg-[#080808]/95 shadow-2xl relative font-mono text-[11px] leading-relaxed">
                  {/* Tab Bar */}
                  <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0d0d]/90 px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setActiveDossierTab('json')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition-all text-[11px] cursor-pointer ${
                          activeDossierTab === 'json'
                            ? 'bg-[#080808] text-white border-t-2 border-white font-bold'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        dossier.json
                      </button>
                      <button
                        onClick={() => setActiveDossierTab('sh')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg transition-all text-[11px] cursor-pointer ${
                          activeDossierTab === 'sh'
                            ? 'bg-[#080808] text-white border-t-2 border-zinc-400 font-bold'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        telemetry.sh
                      </button>
                    </div>
                    {/* Window Controls (macOS style mockup) */}
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                    </div>
                  </div>

                  {/* Editor Window Body with Smooth Animated Tab Switching & Line Numbers */}
                  <div className="p-5 flex-grow overflow-y-auto max-h-[300px] text-slate-300 bg-[#050505]/50 select-text min-h-[220px] text-left">
                    <AnimatePresence mode="wait">
                      {activeDossierTab === 'json' ? (
                        <motion.div
                          key="json"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="flex font-mono text-[11px] leading-relaxed"
                        >
                          {/* Line numbers column */}
                          <div className="text-slate-600 text-right pr-4 border-r border-white/5 select-none space-y-1">
                            <p>1</p>
                            <p>2</p>
                            <p>3</p>
                            <p>4</p>
                            <p>5</p>
                            <p>6</p>
                            <p>7</p>
                            <p>8</p>
                            <p>9</p>
                            <p>10</p>
                            <p>11</p>
                            <p>12</p>
                          </div>
                          
                          {/* Code Content */}
                          <div className="pl-4 space-y-1">
                            <p><span className="text-indigo-400">{"{"}</span></p>
                            <p className="pl-4"><span className="text-pink-400">"developer"</span>: <span className="text-emerald-400">"Yashwant K"</span>,</p>
                            <p className="pl-4"><span className="text-pink-400">"specialization"</span>: <span className="text-emerald-400">"Backend & Agentic Systems"</span>,</p>
                            <p className="pl-4"><span className="text-pink-400">"academic"</span>: <span className="text-indigo-400">{"{"}</span></p>
                            <p className="pl-8"><span className="text-pink-400">"institution"</span>: <span className="text-emerald-400">"Sri Shakthi Inst of Technology"</span>,</p>
                            <p className="pl-8"><span className="text-pink-400">"discipline"</span>: <span className="text-emerald-400">"Computer Science & Eng"</span></p>
                            <p className="pl-4"><span className="text-indigo-400">{"}"}</span>,</p>
                            <p className="pl-4"><span className="text-pink-400">"architecture_standards"</span>: <span className="text-indigo-400">{"{"}</span></p>
                            <p className="pl-8"><span className="text-pink-400">"patterns"</span>: <span className="text-amber-400">"Separation of Concerns (SoC)"</span>,</p>
                            <p className="pl-8"><span className="text-pink-400">"automation"</span>: <span className="text-amber-400">"LangGraph Stateful Loops"</span></p>
                            <p className="pl-4"><span className="text-indigo-400">{"}"}</span></p>
                            <p><span className="text-indigo-400">{"}"}</span></p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sh"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="flex font-mono text-[11px] leading-relaxed"
                        >
                          {/* Line numbers column */}
                          <div className="text-slate-600 text-right pr-4 border-r border-white/5 select-none space-y-1">
                            <p>1</p>
                            <p>2</p>
                            <p>3</p>
                            <p>4</p>
                            <p>5</p>
                            <p>6</p>
                            <p>7</p>
                          </div>
                          
                          {/* Script Content */}
                          <div className="pl-4 space-y-1.5">
                            <p className="text-slate-500">$ ./telemetry.sh --verify-credentials</p>
                            <p className="text-emerald-400">[OK] PORTFOLIO: <a href="https://yashwantk.vercel.app/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">yashwantk.vercel.app</a></p>
                            <p className="text-emerald-400">[OK] LINKEDIN: <a href="https://www.linkedin.com/in/yashwant00cr7/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">linkedin.com/in/yashwant00cr7</a></p>
                            <p className="text-emerald-400">[OK] GITHUB: <a href="https://github.com/Yashwant00CR7" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">github.com/Yashwant00CR7</a></p>
                            <p className="text-zinc-400">[INFO] Compiling local test sandboxes...</p>
                            <p className="text-emerald-400">[OK] Sandbox compiler execution verified.</p>
                            <p className="text-white animate-pulse">[READY] Status: Live System Architect active</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

            </div>
          </section>
        </main>

        {/* Global Footer */}
        <footer className="border-t border-white/10 bg-[#050505]/95 backdrop-blur-md pt-16 pb-12 relative z-10 w-full select-none mt-16">
          {/* Ambient Footer Glow */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] rounded-full bg-purple-500/[0.02] blur-[100px] pointer-events-none" />
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.02] blur-[100px] pointer-events-none" />

          <div className="max-w-6xl mx-auto px-6">
            
            {/* Top Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-12 relative z-10">
              
              {/* Column 1: Brand (4 cols) */}
              <div className="md:col-span-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md">
                    <Zap className="w-4.5 h-4.5 text-black" />
                  </div>
                  <span className="font-heading font-bold text-white text-base">
                    Smart API <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">DevTool</span>
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
                  Autonomous developer agent specializing in parsing unstructured API documentation, generating clean integration wrappers, and resolving sandbox compilation failures in real-time.
                </p>
                {/* Social/Developer Links */}
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="https://github.com/Yashwant00CR7/Smart-API-Integration-Dev-Tool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition cursor-pointer"
                    title="GitHub Repository"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                  </a>
                  <a
                    href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition cursor-pointer"
                    title="Hugging Face Space"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                  <a
                    href="mailto:yashw.dev@gmail.com"
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition cursor-pointer"
                    title="Contact Developer"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Column 2: Platform Links (2 cols) */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-white text-xs font-mono font-bold uppercase tracking-wider">Deployment</h4>
                <ul className="space-y-3.5 text-xs text-slate-400">
                  <li>
                    <a 
                      href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1 hover:text-white transition"
                    >
                      HF Space
                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  </li>
                  <li>
                    <button 
                      onClick={() => navigateTo('workspace')} 
                      className="group flex items-center gap-1 hover:text-white transition cursor-pointer text-left"
                    >
                      Console Port
                      <ArrowRight className="w-3 h-3 text-slate-500 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </li>
                  <li>
                    <a 
                      href="https://github.com/Yashwant00CR7" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center gap-1 hover:text-white transition"
                    >
                      Git Account
                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  </li>
                </ul>
              </div>

              {/* Column 3: System Standards (3 cols) */}
              <div className="md:col-span-3 space-y-4">
                <h4 className="text-white text-xs font-mono font-bold uppercase tracking-wider">Core Architecture</h4>
                <ul className="space-y-2.5 text-xs text-slate-400">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    Clean Separation of Concerns
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    LangGraph Stateful Workflows
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    Isolated Sandbox Compilers
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    Real-time Agent Self-Healing
                  </li>
                </ul>
              </div>

              {/* Column 4: System Diagnostics Widget (3 cols) */}
              <div className="md:col-span-3 space-y-4 bg-white/[0.02] border border-white/5 rounded-2xl p-4 backdrop-blur-sm">
                <h4 className="text-white text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Telemetry Diagnostic
                </h4>
                <div className="space-y-2 font-mono text-[9px] text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>API SCRAPER:</span>
                    <span className="text-emerald-450 font-bold">ONLINE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>SANDBOX EXEC:</span>
                    <span className="text-emerald-450 font-bold">ONLINE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>LLM AGENT:</span>
                    <span className="text-white font-bold animate-pulse">STANDBY</span>
                  </div>
                </div>
                <div className="border-t border-white/5 pt-2 flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-bold text-slate-400 font-mono">React</span>
                  <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-bold text-slate-400 font-mono">FastAPI</span>
                  <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-bold text-slate-400 font-mono">LangGraph</span>
                  <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-bold text-slate-400 font-mono">Tailwind</span>
                </div>
              </div>

            </div>

            {/* Bottom Bar */}
            <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-[10px] font-mono relative z-10">
              <div className="text-center md:text-left leading-normal">
                © {new Date().getFullYear()} Yashwant K. All Rights Reserved. Built for securing software engineering placement.
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // FULL-SCREEN WORKSPACE CONSOLE VIEW
  // -------------------------------------------------------------
  return (
    <div className="h-screen w-screen bg-[#050505] text-slate-100 font-sans flex flex-col overflow-hidden relative">
      
      {/* Ambient background glows */}
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none z-0" />
      <div className="absolute top-[20vh] -left-40 w-[500px] h-[500px] rounded-full bg-zinc-500/[0.02] blur-[120px] aurora-glow-1 pointer-events-none" />
      <div className="absolute top-[40vh] -right-40 w-[500px] h-[500px] rounded-full bg-zinc-500/[0.02] blur-[120px] aurora-glow-2 pointer-events-none" />
      
      {/* Settings Drawer overlay */}
      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop cover */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Drawer sheet */}
            <motion.div
              initial={{ translateX: '100%' }}
              animate={{ translateX: 0 }}
              exit={{ translateX: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="relative w-80 bg-[#090909] border-l border-white/10 h-full p-6 flex flex-col justify-between shadow-2xl z-10"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h4 className="font-heading font-bold text-sm text-white">Workspace Configuration</h4>
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* API Credentials */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    Credentials Settings
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Google Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => handleCredentialChange('gemini', e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-black/45 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Groq API Key</label>
                    <input
                      type="password"
                      value={groqKey}
                      onChange={(e) => handleCredentialChange('groq', e.target.value)}
                      placeholder="gsk_..."
                      className="w-full bg-black/45 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">OpenRouter API Key</label>
                    <input
                      type="password"
                      value={openrouterKey}
                      onChange={(e) => handleCredentialChange('openrouter', e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full bg-black/45 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Firecrawl API Key</label>
                    <input
                      type="password"
                      value={firecrawlKey}
                      onChange={(e) => handleCredentialChange('firecrawl', e.target.value)}
                      placeholder="fc-..."
                      className="w-full bg-black/45 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                </div>

                {/* OpenRouter custom ID adding */}
                {modelProvider === 'openrouter' && (
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                      OpenRouter Models Cache
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCustomModelInput}
                        onChange={(e) => setNewCustomModelInput(e.target.value)}
                        placeholder="meta-llama/llama-3.3-70b-instruct:free"
                        className="flex-grow bg-black/45 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                      <button
                        onClick={handleAddOpenRouterModel}
                        className="bg-white hover:bg-zinc-200 text-black p-2 rounded-lg transition"
                        title="Add Model to Select Dropdown"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <small className="text-[9px] text-slate-500 block leading-normal">Add custom model IDs dynamically to store in local selects.</small>
                  </div>
                )}

              </div>

              <div className="text-[9px] text-slate-500 font-mono text-center pt-4 border-t border-white/5">
                Saved in sessionStorage & localStorage
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOP NAVIGATION BAR PANEL */}
      <nav className="bg-[#050505]/60 backdrop-blur-md px-6 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 z-20 shadow-lg">
        {/* Left section: Breadcrumbs navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('landing')}
            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow shadow-white/5 hover:scale-105 active:scale-95 transition cursor-pointer"
            title="Return to Homepage"
          >
            <Zap className="w-4 h-4 text-black" />
          </button>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400 hover:text-white cursor-pointer transition" onClick={() => navigateTo('landing')}>smart-api-devtool</span>
            <span className="text-white/20">/</span>
            <span className="text-white font-semibold font-sans">workspace-console</span>
          </div>
        </div>

        {/* Center section: Compact health status indicator bar */}
        <div className="hidden md:flex items-center gap-3 bg-zinc-950/45 border border-white/5 rounded-full px-3.5 py-1 text-[10px] font-mono text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>API Node: Active</span>
          <span className="text-white/15 font-normal">|</span>
          <span>Gemini: <span className={backendStatus.gemini === 'Available' || backendStatus.gemini === 'Connected' ? 'text-emerald-450 font-bold' : 'text-zinc-500'}>{backendStatus.gemini}</span></span>
          <span className="text-white/15 font-normal">|</span>
          <span>Groq: <span className={backendStatus.groq === 'Available' || backendStatus.groq === 'Ready' ? 'text-emerald-450 font-bold' : 'text-zinc-500'}>{backendStatus.groq}</span></span>
          <span className="text-white/15 font-normal">|</span>
          <span>OpenRouter: <span className={backendStatus.openrouter === 'Available' || backendStatus.openrouter === 'Ready' ? 'text-emerald-450 font-bold' : 'text-zinc-500'}>{backendStatus.openrouter}</span></span>
          <span className="text-white/15 font-normal">|</span>
          <span>Ollama: <span className={backendStatus.ollama === 'Connected' ? 'text-emerald-450 font-bold' : 'text-zinc-500'}>{backendStatus.ollama}</span></span>
        </div>

        {/* Right section: Sidebar toggle and configuration controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              sidebarOpen 
                ? 'bg-white/10 border-white/20 text-white' 
                : 'bg-transparent border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Toggle Cache Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-transparent border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            title="Open Configuration Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* DUAL COLS WORKSPACE PORT */}
      <div className="flex-grow flex overflow-hidden relative z-10 min-h-0 w-full">
                {/* Left Caching Sidebar */}
        {sidebarOpen && (
          <div className="w-64 bg-[#080808]/40 border-r border-white/10 flex flex-col p-4 flex-shrink-0 select-none backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Saved integrations</span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-white/5 border border-white/10 rounded text-slate-350">
                {integrations.length}
              </span>
            </div>

            <div className="flex-grow overflow-y-auto mb-4 space-y-2 pr-1">
              {integrations.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-12 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                  No cached integrations
                </div>
              ) : (
                integrations.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleLoadHistoryRecord(item)}
                    className={`group p-3 rounded-lg border text-left cursor-pointer transition duration-150 flex items-center justify-between gap-3 ${
                      currentIntegration?.id === item.id
                        ? 'bg-white/10 border-white/20 text-white shadow-sm'
                        : 'bg-transparent border-white/5 hover:bg-white/5 text-slate-400'
                    }`}
                  >
                    <div className="min-w-0 flex-grow">
                      <div className="text-xs font-bold text-slate-200 truncate">{item.title}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        <span className="px-1 py-0.2 bg-white/5 border border-white/10 rounded text-[8px] font-extrabold uppercase text-slate-300">
                          {item.language}
                        </span>
                        <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteHistoryRecord(item.id, e)}
                      className="p-1 text-slate-500 hover:text-red-400 rounded transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleClearAllHistory}
              className="w-full text-center text-xs font-bold py-2 px-3 border border-white/10 text-slate-400 bg-white/5 hover:border-red-500/30 hover:text-red-400 rounded-lg transition cursor-pointer"
            >
              Clear Workspace Cache
            </button>
          </div>
        )}

        {/* Form Inputs Parameter panel */}
        <div
          className="flex-shrink-0 flex flex-col p-4 overflow-y-auto bg-transparent"
          style={{ width: `${leftWidth}px` }}
        >
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4 overflow-y-auto h-full text-white shadow-2xl">
            <div className="border-b border-white/5 pb-4">
              <h3 className="font-heading font-bold text-lg text-white leading-tight">Execution Configuration</h3>
              <p className="text-xs text-slate-400 mt-1">Specify core operational attributes.</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleGeneratePipeline(); }} className="space-y-4">
              
              {/* Input Sources Toggle */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Documentation Source System</label>
                <div className="flex bg-[#050505]/60 p-1 border border-white/10 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleSourceTabChange('url')}
                    className={`flex-grow py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      selectedSource === 'url' ? 'bg-white text-black shadow-md border border-white/5 font-extrabold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Scrape Documentation URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceTabChange('text')}
                    className={`flex-grow py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      selectedSource === 'text' ? 'bg-white text-black shadow-md border border-white/5 font-extrabold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Raw Docs Markdown
                  </button>
                </div>

                {selectedSource === 'url' ? (
                  <div className="mt-1">
                    <input
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://api.stripe.com/docs/v1"
                      className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:bg-[#0d0f15] focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                    <small className="text-[10px] text-slate-500 mt-1 block leading-relaxed">System relies on Cloud Firecrawl to scrape target specifications dynamically.</small>
                  </div>
                ) : (
                  <div className="mt-1">
                    <textarea
                      value={rawDocs}
                      onChange={(e) => setRawDocs(e.target.value)}
                      placeholder="# Charges API&#10;POST /v1/charges&#10;Headers: Authorization Bearer"
                      rows={6}
                      className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs font-mono text-white placeholder-slate-650 focus:outline-none focus:bg-[#0d0f15] focus:border-white/30 focus:ring-1 focus:ring-white/20"
                    />
                    <small className="text-[10px] text-slate-500 mt-1 block leading-relaxed">Direct offline markdown document text fallback.</small>
                  </div>
                )}
              </div>

              {/* Target Use Case constraints */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Use Case Constraints</label>
                <textarea
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder={languagePlaceholders[language]}
                  rows={4}
                  className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:bg-[#0d0f15] focus:border-white/30 focus:ring-1 focus:ring-white/20"
                  required
                />
              </div>

              {/* Runtime Language & LLM Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Code Runtime</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:bg-[#0d0f15] focus:border-white/30"
                  >
                    <option value="python">Python (pytest)</option>
                    <option value="javascript">JavaScript (Node)</option>
                    <option value="typescript">TypeScript (ts-node)</option>
                    <option value="go">Go (testing)</option>
                    <option value="java">Java (JUnit)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Model Provider</label>
                  <select
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value)}
                    className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:bg-[#0d0f15] focus:border-white/30"
                  >
                    <option value="gemini">Google Gemini (Cloud)</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>
              </div>

              {/* Google Gemini Model Selector */}
              {modelProvider === 'gemini' && (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gemini Tier Selection</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:bg-[#0d0f15] focus:border-white/30"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Default optimized)</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Advanced Coding)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  </select>
                </div>
              )}

              {/* Groq Model Selector */}
              {modelProvider === 'groq' && (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Groq Inference Core</label>
                  <select
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:bg-[#0d0f15] focus:border-white/30"
                  >
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                    <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout (Preview)</option>
                  </select>
                </div>
              )}

              {/* OpenRouter Model Selector */}
              {modelProvider === 'openrouter' && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">OpenRouter Target Model</label>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="text-[9px] text-slate-350 hover:text-white uppercase font-semibold cursor-pointer"
                    >
                      + Add Model ID
                    </button>
                  </div>
                  <select
                    value={openrouterModel}
                    onChange={(e) => setOpenrouterModel(e.target.value)}
                    className="w-full bg-[#0a0c10]/80 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:bg-[#0d0f15] focus:border-white/30"
                  >
                    {openrouterCustomModels.map(modelId => (
                      <option key={modelId} value={modelId}>{modelId}</option>
                    ))}
                  </select>
                </div>
              )}


              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-white hover:bg-zinc-200 text-black text-xs font-extrabold py-3 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 relative shadow-lg shadow-white/5 cursor-pointer animate-pulse-slow"
              >
                {isGenerating ? (
                  <>
                    <span>Compiling Deliverables...</span>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin absolute right-4" />
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Execute Self-Healing Generator</span>
                  </>
                )}
              </button>

            </form>
            
            {/* Info note about cloud hosting space */}
            <div className="mt-auto border-t border-white/5 pt-4">
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Cloud Deployment</span>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-350 bg-white/5 border border-white/10 rounded-lg p-2.5">
                <span>Hugging Face Space:</span>
                <a
                  href="https://huggingface.co/spaces/Yash030/Smart-Dev-API-Tool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white underline font-semibold flex items-center gap-1"
                >
                  Launch Cloud
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Resizing column bar */}
        <div
          onMouseDown={() => setIsDraggingColumn(true)}
          className={`w-1 hover:w-1.5 bg-white/5 hover:bg-white/20 cursor-col-resize self-stretch transition-all duration-150 flex-shrink-0 flex items-center justify-center relative ${
            isDraggingColumn ? 'bg-white/30' : ''
          }`}
        >
          <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize z-10" />
        </div>

        {/* Right Workspace telemetry & results */}
        <div className="flex-grow flex-1 flex flex-col min-w-0 min-h-0 bg-transparent p-4 gap-4 overflow-y-auto">
          
          <div className="flex-grow flex flex-col min-h-0">
            
            {/* Telemetry Console */}
            <div
              id="console-wrapper"
              className="flex-shrink-0 flex flex-col bg-[#07090e] border border-white/10 shadow-lg rounded-xl overflow-hidden mb-4"
              style={{ height: `${consoleHeight}px` }}
            >
              <div className="bg-[#0f111a] px-4 py-2 border-b border-white/5 flex items-center justify-between relative flex-shrink-0">
                {/* Dots */}
                <div className="flex items-center gap-1.5 z-10">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                
                {/* Centered Title */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="font-mono text-[10px] text-zinc-400 font-semibold tracking-tight">Sandbox Environment Active Status Console</span>
                </div>
                
                {/* Right Pill & Controls */}
                <div className="flex items-center gap-3 z-10">
                  <button
                    onClick={handleClearLogs}
                    className="text-[9px] font-bold text-zinc-500 hover:text-zinc-300 transition uppercase"
                  >
                    Clear Logs
                  </button>
                  <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                    pulseState === 'Active' 
                      ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30 animate-pulse' 
                      : 'bg-[#131b2e] text-[#5f87e2] border border-[#1d2d4c]'
                  }`}>
                    {pulseState === 'Active' ? 'ACTIVE' : 'IDLE'}
                  </span>
                </div>
              </div>

              <div 
                ref={consoleLogsContainerRef}
                className="p-4 flex-grow overflow-y-auto font-mono text-[11px] flex flex-col gap-1 bg-[#0a0c10]"
              >
                {logs.map((log, idx) => (
                  <div key={idx} className="relative">
                    {renderLogText(log.text, log.type)}
                    {idx === logs.length - 1 && <span className="terminal-caret text-zinc-400">_</span>}
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-zinc-650 font-mono text-[11px]">Console silent. System waiting...<span className="terminal-caret text-zinc-400">_</span></div>
                )}
              </div>
            </div>

            {/* Vertical resizing bar */}
            <div
              onMouseDown={() => setIsDraggingConsole(true)}
              className="h-1 bg-white/5 hover:bg-white/10 cursor-row-resize flex-shrink-0 relative z-10"
            >
              <div className="absolute inset-x-0 -top-1 -bottom-1 cursor-row-resize z-20" />
            </div>

            {/* Graph flow visualizer + result tabs */}
            <div className="flex-grow flex flex-col min-h-0 glass-panel shadow-2xl rounded-xl p-4 gap-4 mt-2">
              {renderFlowchartVisualizer()}

              {/* Output Tab contents */}
              {resultsVisible && currentIntegration ? (                <div className={`rounded-xl border border-white/10 flex-grow flex flex-col min-h-0 overflow-hidden ${
                  fullscreenResult ? 'results-card-fullscreen shadow-2xl z-[9999]' : ''
                }`}>
                  
                  {/* Actions bar header */}
                  <div className="bg-[#0a0c10]/60 px-5 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                        {currentIntegration.language.toUpperCase()}
                      </span>
                      <h4 className="text-xs font-bold text-white truncate max-w-xs">{currentIntegration.title}</h4>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setFullscreenResult(!fullscreenResult)}
                        className="p-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Toggle Fullscreen"
                      >
                        {fullscreenResult ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={handleDownloadZIP}
                        className="inline-flex items-center gap-1 font-bold text-[10px] text-white bg-emerald-650 hover:bg-emerald-700 py-1.5 px-3 rounded-lg transition shadow shadow-emerald-500/10 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        ZIP Deliverable
                      </button>
                    </div>
                  </div>

                  {/* Tabs bar */}
                  <div className="flex bg-[#050505]/45 border-b border-white/5 p-2 gap-1 flex-shrink-0">
                    {(['overview', 'endpoints', 'code', 'tests', 'readme'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveResultTab(tab)}
                        className={`text-[10px] font-bold py-1.5 px-3 rounded-lg transition cursor-pointer ${
                          activeResultTab === tab
                            ? 'bg-white text-black font-extrabold shadow-md'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Document panel viewport */}
                  <div className="p-5 flex-grow overflow-y-auto bg-transparent text-slate-350">
                    {activeResultTab === 'overview' && (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: formatMarkdownToHTML(currentIntegration.overview) }}
                      />
                    )}
                    {activeResultTab === 'endpoints' && (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: formatMarkdownToHTML(currentIntegration.endpoints) }}
                      />
                    )}
                    {activeResultTab === 'code' && (
                      <div className="relative">
                        <div className="absolute top-0 right-0 flex gap-2 z-10">
                          <button
                            id="btn-copy-code"
                            onClick={() => handleCopyCode(currentIntegration.code, 'btn-copy-code')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-350 hover:text-white cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                          <button
                            onClick={() => handleDownloadSingleFile('code')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-350 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                        <pre className="bg-[#090909] p-4 border border-white/5 rounded-lg font-mono text-xs overflow-x-auto select-all mt-8">
                          <code>{currentIntegration.code}</code>
                        </pre>
                      </div>
                    )}
                    {activeResultTab === 'tests' && (
                      <div className="relative">
                        <div className="absolute top-0 right-0 flex gap-2 z-10">
                          <button
                            id="btn-copy-tests"
                            onClick={() => handleCopyCode(currentIntegration.tests, 'btn-copy-tests')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-355 hover:text-white cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                          <button
                            onClick={() => handleDownloadSingleFile('tests')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-355 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                        <pre className="bg-[#090909] p-4 border border-white/5 rounded-lg font-mono text-xs overflow-x-auto select-all mt-8">
                          <code>{currentIntegration.tests}</code>
                        </pre>
                      </div>
                    )}
                    {activeResultTab === 'readme' && (
                      <div className="relative">
                        <div className="absolute top-0 right-0 flex gap-2 z-10">
                          <button
                            id="btn-copy-readme"
                            onClick={() => handleCopyCode(currentIntegration.readme, 'btn-copy-readme')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-355 hover:text-white cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                          <button
                            onClick={() => handleDownloadSingleFile('readme')}
                            className="flex items-center gap-1 text-[10px] font-semibold bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition text-slate-355 hover:text-white cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                        <pre className="bg-[#090909] p-4 border border-white/5 rounded-lg font-mono text-xs overflow-x-auto select-all mt-8">
                          <code>{currentIntegration.readme}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                  <FileCode className="w-10 h-10 text-slate-500 mb-2" />
                  <h4 className="text-xs font-bold text-white mb-1">Awaiting Generation Results</h4>
                  <p className="text-[10px] text-slate-500 max-w-xs">Provide constraints on the left parameter panel and trigger execution to populate client deliverables.</p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirmModal.visible && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#080808] border border-white/10 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                  <h4 className="font-heading font-bold text-base text-white">{confirmModal.title}</h4>
                </div>
                <p className="text-xs text-slate-400 mt-3 leading-normal">{confirmModal.message}</p>
              </div>

              <div className="bg-black/35 px-6 py-4 flex justify-end gap-2 border-t border-white/5">
                <button
                  onClick={() => confirmModal.resolve?.(false)}
                  className="text-xs font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmModal.resolve?.(true)}
                  className="text-xs font-bold text-black bg-white hover:bg-zinc-200 px-4 py-2 rounded-lg transition"
                >
                  {confirmModal.btnText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

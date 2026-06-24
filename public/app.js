document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('gen-form');
    const btnGenerate = document.getElementById('btn-generate');
    const btnNew = document.getElementById('btn-new');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const historyList = document.getElementById('history-list');
    
    // API Source tabs
    const tabSrcUrl = document.getElementById('tab-src-url');
    const tabSrcText = document.getElementById('tab-src-text');
    const srcUrlContainer = document.getElementById('src-url-container');
    const srcTextContainer = document.getElementById('src-text-container');
    
    // Status Elements
    const statusBackend = document.getElementById('status-backend');
    const statusGemini = document.getElementById('status-gemini');
    const statusOllama = document.getElementById('status-ollama');
    const statusGroq = document.getElementById('status-groq');
    
    // Input Fields
    const apiUrlInput = document.getElementById('api-url');
    const rawDocsInput = document.getElementById('raw-docs');
    const useCaseInput = document.getElementById('use-case');
    const languageSelect = document.getElementById('language');
    const modelProviderSelect = document.getElementById('model-provider');
    const groqModelSelect = document.getElementById('groq-model');
    const groqModelContainer = document.getElementById('groq-model-container');
    
    // Console Output
    const consoleLogs = document.getElementById('console-logs');
    const consolePulse = document.getElementById('console-pulse');
    
    // Results
    const resultsCard = document.getElementById('results-card');
    const badgeLanguage = document.getElementById('badge-language');
    const resultsHeadline = document.getElementById('results-headline');
    const resTabButtons = document.querySelectorAll('.res-tab-btn');
    const resPanels = document.querySelectorAll('.res-panel');
    const overviewContent = document.getElementById('overview-content');
    const endpointsContent = document.getElementById('endpoints-content');
    const codeContent = document.getElementById('code-content');
    const testsContent = document.getElementById('tests-content');
    const readmeContent = document.getElementById('readme-content');
    
    // Download Buttons
    const btnDownloadZip = document.getElementById('btn-download-zip');
    const btnCopyButtons = document.querySelectorAll('.btn-copy');
    const btnDownloadFileButtons = document.querySelectorAll('.btn-download-file');

    // State Variables
    let selectedSource = 'url'; // 'url' or 'text'
    let currentIntegration = null; // Currently active integration object
    let integrations = []; // History array

    // 1. Initial Setup
    init();

    function init() {
        loadHistory();
        checkBackendStatus();
        setupEventListeners();
    }

    // Load history list from localStorage
    function loadHistory() {
        const stored = localStorage.getItem('api_integrations_history');
        if (stored) {
            try {
                integrations = JSON.parse(stored);
            } catch (e) {
                integrations = [];
            }
        }
        renderHistory();
    }

    // Render history sidebar items
    function renderHistory() {
        historyList.innerHTML = '';
        if (integrations.length === 0) {
            historyList.innerHTML = '<li class="empty-history">No integrations yet</li>';
            return;
        }

        integrations.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = `history-item ${currentIntegration && currentIntegration.id === item.id ? 'active' : ''}`;
            
            // Format timestamp nicely
            const date = new Date(item.timestamp);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            li.innerHTML = `
                <div class="history-title" title="${item.title}">${item.title}</div>
                <div class="history-meta">
                    <span class="history-lang">${item.language}</span>
                    <span>${dateStr}</span>
                </div>
            `;
            li.addEventListener('click', () => loadIntegrationDetails(item));
            historyList.appendChild(li);
        });
    }

    // Save new integration to history list
    function saveIntegrationToHistory(data) {
        // Create descriptive title
        let title = '';
        if (data.url) {
            try {
                const parsedUrl = new URL(data.url);
                title = parsedUrl.hostname + parsedUrl.pathname;
                if (title.length > 30) title = parsedUrl.hostname + '/...';
            } catch (e) {
                title = data.url;
            }
        } else {
            title = data.useCase.substring(0, 25) + '...';
        }

        const newRecord = {
            id: 'int_' + Date.now(),
            title: title,
            timestamp: new Date().toISOString(),
            url: data.url,
            rawDocs: data.rawDocs,
            useCase: data.useCase,
            language: data.language,
            modelProvider: data.modelProvider,
            groqModel: data.groqModel,
            overview: data.result.overview,
            endpoints: data.result.endpoints,
            code: data.result.code,
            tests: data.result.tests,
            readme: data.result.readme
        };

        // Remove duplicates if same URL & language
        integrations = integrations.filter(item => !(item.url === newRecord.url && item.language === newRecord.language && item.url));
        
        // Add to front of history array
        integrations.unshift(newRecord);
        try {
            localStorage.setItem('api_integrations_history', JSON.stringify(integrations));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                appendConsoleLine('[Warning] Browser local storage quota full. History could not be updated.', 'error');
                alert('Local storage is full. Please clear some integrations from your history to save new ones.');
            } else {
                console.error('LocalStorage error:', e);
            }
        }
        
        currentIntegration = newRecord;
        renderHistory();
        loadIntegrationDetails(newRecord);
    }

    // Load integration details into output tabs
    function loadIntegrationDetails(record) {
        currentIntegration = record;
        
        // Highlight active sidebar item
        const items = historyList.querySelectorAll('.history-item');
        integrations.forEach((item, index) => {
            if (items[index]) {
                if (item.id === record.id) {
                    items[index].classList.add('active');
                } else {
                    items[index].classList.remove('active');
                }
            }
        });

        // Set inputs corresponding to this integration (except keys)
        if (record.url) {
            selectedSource = 'url';
            tabSrcUrl.classList.add('active');
            tabSrcText.classList.remove('active');
            srcUrlContainer.classList.remove('hidden');
            srcTextContainer.classList.add('hidden');
            apiUrlInput.value = record.url;
            rawDocsInput.value = '';
        } else {
            selectedSource = 'text';
            tabSrcText.classList.add('active');
            tabSrcUrl.classList.remove('active');
            srcTextContainer.classList.remove('hidden');
            srcUrlContainer.classList.add('hidden');
            rawDocsInput.value = record.rawDocs || '';
            apiUrlInput.value = '';
        }
        
        useCaseInput.value = record.useCase;
        languageSelect.value = record.language;
        modelProviderSelect.value = record.modelProvider;
        if (record.modelProvider === 'groq') {
            groqModelContainer.classList.remove('hidden');
            if (record.groqModel) {
                groqModelSelect.value = record.groqModel;
            }
        } else {
            groqModelContainer.classList.add('hidden');
        }

        // Set output panel content
        badgeLanguage.textContent = record.language;
        resultsHeadline.textContent = record.title;
        
        overviewContent.innerHTML = formatMarkdown(record.overview);
        endpointsContent.innerHTML = formatMarkdown(record.endpoints);
        codeContent.textContent = record.code;
        testsContent.textContent = record.tests;
        readmeContent.textContent = record.readme;

        // Reveal Results card
        resultsCard.classList.remove('hidden');
        
        // Reset output console
        consoleLogs.innerHTML = `<div class="console-line system">[System] Integration loaded from history. Ready.</div>`;
        consolePulse.textContent = 'Idle';
        consolePulse.className = 'console-status';
    }

    // Simple markdown formatting helper for overview/endpoints HTML rendering
    function formatMarkdown(text) {
        if (!text) return '';
        let html = text;
        
        // Escape HTML tags to prevent XSS/rendering issues
        html = html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Markdown Headers
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
        
        // Bullet lists
        html = html.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
        html = html.replace(/<\/ul>\s*<ul>/g, ''); // Merge consecutive ul lists
        
        // Code Blocks (Fenced)
        html = html.replace(/```(.*?)\n(.*?)```/gs, '<pre><code class="language-$1">$2</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Newlines to paragraphs if not in HTML structures
        html = html.split('\n\n').map(para => {
            if (para.trim().startsWith('<h') || para.trim().startsWith('<ul') || para.trim().startsWith('<pre') || para.trim().startsWith('<li')) {
                return para;
            }
            return `<p>${para.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    }

    // 2. Event Listeners Binding
    function setupEventListeners() {
        // Toggle Source tab: URL
        tabSrcUrl.addEventListener('click', () => {
            selectedSource = 'url';
            tabSrcUrl.classList.add('active');
            tabSrcText.classList.remove('active');
            srcUrlContainer.classList.remove('hidden');
            srcTextContainer.classList.add('hidden');
            apiUrlInput.required = true;
            rawDocsInput.required = false;
        });

        // Toggle Source tab: TEXT
        tabSrcText.addEventListener('click', () => {
            selectedSource = 'text';
            tabSrcText.classList.add('active');
            tabSrcUrl.classList.remove('active');
            srcTextContainer.classList.remove('hidden');
            srcUrlContainer.classList.add('hidden');
            apiUrlInput.required = false;
            rawDocsInput.required = true;
        });



        // Clear history click
        btnClearHistory.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear your integration history?')) {
                integrations = [];
                localStorage.removeItem('api_integrations_history');
                currentIntegration = null;
                renderHistory();
                resultsCard.classList.add('hidden');
                consoleLogs.innerHTML = `<div class="console-line system">[System] History cleared.</div>`;
            }
        });

        // New Integration click (resets form inputs)
        btnNew.addEventListener('click', () => {
            currentIntegration = null;
            apiUrlInput.value = '';
            rawDocsInput.value = '';
            useCaseInput.value = '';
            languageSelect.selectedIndex = 0;
            modelProviderSelect.selectedIndex = 0;
            if (groqModelSelect) groqModelSelect.selectedIndex = 0;
            if (groqModelContainer) groqModelContainer.classList.add('hidden');
            
            // Remove active highlight in sidebar
            const items = historyList.querySelectorAll('.history-item');
            items.forEach(li => li.classList.remove('active'));

            resultsCard.classList.add('hidden');
            consoleLogs.innerHTML = `<div class="console-line system">[System] Form reset. Ready for a new integration.</div>`;
            consolePulse.textContent = 'Idle';
            consolePulse.className = 'console-status';
        });

        // Toggle Groq Model selection on provider change
        modelProviderSelect.addEventListener('change', () => {
            if (modelProviderSelect.value === 'groq') {
                groqModelContainer.classList.remove('hidden');
            } else {
                groqModelContainer.classList.add('hidden');
            }
        });

        // Form Submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            generateWrapper();
        });

        // Output Tab clicks
        resTabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                // Set active tab button
                resTabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Set active panel
                resPanels.forEach(p => p.classList.remove('active'));
                document.getElementById(targetTab).classList.add('active');
            });
        });

        // Copy button clicks
        btnCopyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const text = document.getElementById(targetId).textContent;
                
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.classList.add('btn-success');
                    
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.classList.remove('btn-success');
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            });
        });

        // Individual File Download clicks
        btnDownloadFileButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentIntegration) return;
                const fileType = btn.getAttribute('data-file');
                let content = '';
                let filename = '';

                const lang = currentIntegration.language.toLowerCase();
                
                if (fileType === 'code') {
                    content = currentIntegration.code;
                    filename = getClientFilename(lang);
                } else if (fileType === 'tests') {
                    content = currentIntegration.tests;
                    filename = getTestFilename(lang, currentIntegration.tests);
                } else if (fileType === 'readme') {
                    content = currentIntegration.readme;
                    filename = 'README.md';
                }

                downloadTextFile(filename, content);
            });
        });

        // Package ZIP download click
        btnDownloadZip.addEventListener('click', () => {
            if (!currentIntegration) return;
            downloadPackageZip();
        });
    }

    // 3. API Communication & Terminal Simulation
    async function checkBackendStatus() {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data = await res.json();
                
                // Update Backend status
                statusBackend.querySelector('.status-indicator').className = 'status-indicator green';
                statusBackend.querySelector('.status-label').textContent = 'Online';
                
                // Update Gemini status
                const hasGemini = data.configuration.has_gemini_key;
                statusGemini.querySelector('.status-indicator').className = hasGemini ? 'status-indicator green' : 'status-indicator red';
                statusGemini.querySelector('.status-label').textContent = hasGemini ? 'Available' : 'Config Required';
                
                // Update Groq status
                const hasGroq = data.configuration.has_groq_key;
                statusGroq.querySelector('.status-indicator').className = hasGroq ? 'status-indicator green' : 'status-indicator red';
                statusGroq.querySelector('.status-label').textContent = hasGroq ? 'Available' : 'Config Required';
                
                // Update Ollama status
                statusOllama.querySelector('.status-indicator').className = 'status-indicator green';
                statusOllama.querySelector('.status-label').textContent = 'Active';
            } else {
                throw new Error('Healthy endpoint returned non-200');
            }
        } catch (e) {
            statusBackend.querySelector('.status-indicator').className = 'status-indicator red';
            statusBackend.querySelector('.status-label').textContent = 'Offline';
            
            statusOllama.querySelector('.status-indicator').className = 'status-indicator red';
            statusOllama.querySelector('.status-label').textContent = 'Disconnected';
            
            statusGroq.querySelector('.status-indicator').className = 'status-indicator red';
            statusGroq.querySelector('.status-label').textContent = 'Disconnected';
        }
    }

    function appendConsoleLine(text, type = 'system') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = text;
        consoleLogs.appendChild(line);
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function generateWrapper() {
        const url = apiUrlInput.value.trim();
        const rawDocs = rawDocsInput.value.trim();
        const useCase = useCaseInput.value.trim();
        const language = languageSelect.value;
        const modelProvider = modelProviderSelect.value;
        const groqModel = groqModelSelect.value;

        // 1. Validation
        if (selectedSource === 'url' && !url) {
            alert('Please provide an API documentation URL.');
            return;
        }
        if (selectedSource === 'text' && !rawDocs) {
            alert('Please paste the API documentation text.');
            return;
        }
        if (!useCase) {
            alert('Please specify your target use case.');
            return;
        }



        // 2. Set UI Loading State
        btnGenerate.disabled = true;
        btnGenerate.querySelector('.btn-text').textContent = 'Generating...';
        btnGenerate.querySelector('.loader').classList.remove('hidden');
        resultsCard.classList.add('hidden');

        consolePulse.textContent = 'Running';
        consolePulse.className = 'console-status active';
        consoleLogs.innerHTML = ''; // Clear previous terminal

        // 3. Initiate Simulated Terminal Log Outputs
        appendConsoleLine('[System] Initializing self-healing API generation workflow...', 'system');
        await delay(500);

        if (selectedSource === 'url') {
            appendConsoleLine(`[Scraper] Connecting to Firecrawl cloud scraper for: ${url}`, 'scraper');
            await delay(700);
            appendConsoleLine('[Scraper] Scraping content and compiling cleaner Markdown text...', 'scraper');
        } else {
            appendConsoleLine('[System] Reading manually pasted raw API documentation content...', 'system');
        }
        await delay(600);

        appendConsoleLine(`[Agent] Booting LangGraph StateRouter. Model Provider: ${modelProvider.toUpperCase()}`, 'agent');
        await delay(500);
        appendConsoleLine('[Agent] Generating initial wrapper blueprint & test configurations...', 'agent');

        // Trigger backend call
        const payload = {
            use_case: useCase,
            language: language,
            model_provider: modelProvider,
            url: selectedSource === 'url' ? url : null,
            raw_docs: selectedSource === 'text' ? rawDocs : null,
            groq_model: groqModel || null
        };

        let requestFailed = false;
        let responseData = null;

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errMsg = 'Failed API call';
                try {
                    const errData = await response.json();
                    errMsg = errData.detail || errMsg;
                } catch (_) {
                    errMsg = `HTTP Error ${response.status}: ${response.statusText}`;
                }
                throw new Error(errMsg);
            }

            try {
                responseData = await response.json();
            } catch (e) {
                throw new Error('Invalid JSON response returned from the server.');
            }
        } catch (e) {
            requestFailed = true;
            appendConsoleLine(`[Error] Generation failed due to server exception: ${e.message}`, 'error');
            consolePulse.textContent = 'Failed';
            consolePulse.className = 'console-status';
        }

        if (requestFailed) {
            // Restore button
            btnGenerate.disabled = false;
            btnGenerate.querySelector('.btn-text').textContent = 'Generate Verified Wrapper';
            btnGenerate.querySelector('.loader').classList.add('hidden');
            return;
        }

        // 4. Simulate remaining agent loop based on ACTUAL backend results
        const retryCount = responseData.retry_count || 0;
        const testPassed = responseData.test_passed;
        const errorLogs = responseData.error_logs || '';

        // If backend returns immediately, simulate iteration loops dynamically
        for (let i = 0; i <= retryCount; i++) {
            if (i > 0) {
                appendConsoleLine(`[Sandbox] Execution failed! Compilation/Assertion Error details detected in subprocess.`, 'error');
                await delay(800);
                appendConsoleLine(`[Agent] Self-Healing Loop initiated. Feeding console stderr back to ${modelProvider.toUpperCase()} (Iteration ${i}/3)...`, 'agent');
                await delay(1000);
                appendConsoleLine('[Agent] Correcting syntax parameters, imports, and mock fixtures...', 'agent');
                await delay(700);
            }

            appendConsoleLine(`[Sandbox] Deploying code execution sandbox...`, 'sandbox');
            await delay(600);
            
            const cmd = getLanguageTestCmd(language);
            appendConsoleLine(`[Sandbox] Running unit test validation: ${cmd}`, 'sandbox');
            await delay(1000);
        }

        if (testPassed) {
            appendConsoleLine('[Sandbox] Unit test run completed: all assertions passed (0 errors)!', 'success');
            await delay(400);
            appendConsoleLine('[System] Code successfully compiled, validated, and packaged.', 'success');
            
            // Save to history list
            saveIntegrationToHistory({
                url: selectedSource === 'url' ? url : null,
                rawDocs: selectedSource === 'text' ? rawDocs : null,
                useCase: useCase,
                language: language,
                modelProvider: modelProvider,
                groqModel: groqModel,
                result: responseData
            });
            
            // Update health status panel
            checkBackendStatus();
        } else {
            appendConsoleLine('[Sandbox] Unit test runs failed compilation check after maximum retries.', 'error');
            if (errorLogs) {
                appendConsoleLine(`[Sandbox Stderr]\n${errorLogs}`, 'error');
            }
            appendConsoleLine('[System] Self-Healing Agent loop terminated. Generated code package saved with failure logs.', 'error');
            
            // Show results anyway so they can see/fix the code manually
            saveIntegrationToHistory({
                url: selectedSource === 'url' ? url : null,
                rawDocs: selectedSource === 'text' ? rawDocs : null,
                useCase: useCase,
                language: language,
                modelProvider: modelProvider,
                groqModel: groqModel,
                result: responseData
            });
        }

        // Restore button state
        btnGenerate.disabled = false;
        btnGenerate.querySelector('.btn-text').textContent = 'Generate Verified Wrapper';
        btnGenerate.querySelector('.loader').classList.add('hidden');
        
        consolePulse.textContent = 'Idle';
        consolePulse.className = 'console-status';
    }

    // Helper to get matching commands for logging
    function getLanguageTestCmd(lang) {
        lang = lang.toLowerCase();
        if (lang === 'python') return 'pytest test_client.py';
        if (lang === 'javascript') return 'node test_client.test.js';
        if (lang === 'typescript') return 'npx ts-node test_client.test.ts';
        if (lang === 'go') return 'go test -v client.go client_test.go';
        if (lang === 'java') return 'javac MyAPIClient.java TestClient.java && java -ea TestClient';
        return 'npm test';
    }

    // Helper to get client files name
    function getClientFilename(lang) {
        if (lang === 'python') return 'client.py';
        if (lang === 'javascript') return 'client.js';
        if (lang === 'typescript') return 'client.ts';
        if (lang === 'go') return 'client.go';
        if (lang === 'java') {
            // Retrieve actual class name from code if possible, else default
            const code = currentIntegration.code;
            const match = code.match(/(?:public\s+)?class\s+(\w+)/);
            return match ? `${match[1]}.java` : 'MyAPIClient.java';
        }
        return 'client';
    }

    // Helper to get test files name
    function getTestFilename(lang, testCode = '') {
        if (lang === 'python') return 'test_client.py';
        if (lang === 'javascript') return 'test_client.test.js';
        if (lang === 'typescript') return 'test_client.test.ts';
        if (lang === 'go') return 'client_test.go';
        if (lang === 'java') {
            const match = testCode.match(/(?:public\s+)?class\s+(\w+)/);
            return match ? `${match[1]}.java` : 'TestClient.java';
        }
        return 'test_client';
    }

    // Trigger basic text file browser download
    function downloadTextFile(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const element = document.createElement('a');
        element.setAttribute('href', url);
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // Compiles files using client-side JSZip and downloads
    function downloadPackageZip() {
        if (!currentIntegration) return;
        
        if (typeof JSZip === 'undefined') {
            alert('The JSZip library could not be loaded. Please ensure you are online to package files as a ZIP, or download individual files instead.');
            return;
        }
        
        const zip = new JSZip();
        const lang = currentIntegration.language.toLowerCase();
        
        const clientFile = getClientFilename(lang);
        const testFile = getTestFilename(lang, currentIntegration.tests);
        
        // Add files to zip
        zip.file(clientFile, currentIntegration.code);
        zip.file(testFile, currentIntegration.tests);
        zip.file('README.md', currentIntegration.readme);
        
        // Build tsconfig if typescript
        if (lang === 'typescript') {
            const tsconfig = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "strict": false,
    "skipLibCheck": true
  }
}`;
            zip.file('tsconfig.json', tsconfig);
        }

        // Generate zip file and download it
        zip.generateAsync({ type: 'blob' }).then((content) => {
            const element = document.createElement('a');
            element.href = URL.createObjectURL(content);
            element.download = `api-wrapper-${lang}.zip`;
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }).catch(err => {
            console.error('Failed to create ZIP package: ', err);
            alert('Failed to package wrapper files into ZIP.');
        });
    }
});

// State Variables
let editor = null;
let pyodide = null;
let isPyodideLoading = true;
let consoleElement = document.getElementById('outputConsole');
let runBtn = document.getElementById('runBtn');
let runBtnText = document.getElementById('runBtnText');
let pyodideStatus = document.getElementById('pyodideStatus');
let defaultCode = `print("Become the programmer you're meant to be!")\n`;

// Monaco Editor Initialization
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

function initMonaco() {
  // Register custom theme
  monaco.editor.defineTheme('python-ide-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'identifier', foreground: 'f8f8f2' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'type', foreground: '8be9fd', fontStyle: 'italic' }
    ],
    colors: {
      'editor.background': '#0d121f',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#1e293b55',
      'editorCursor.foreground': '#f8f8f0',
      'editor.selectionBackground': '#44475a77',
      'editor.inactiveSelectionBackground': '#44475a44',
      'editorLineNumber.foreground': '#4f5e7b',
      'editorLineNumber.activeForeground': '#7c3aed',
      'editorWidget.background': '#0d121f',
      'editorWidget.border': '#1e293b'
    }
  });

  // Create Editor
  editor = monaco.editor.create(document.getElementById('monacoEditor'), {
    value: defaultCode,
    language: 'python',
    theme: 'python-ide-theme',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineHeight: 22,
    minimap: { enabled: false },
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    roundedSelection: true,
    scrollBeyondLastLine: false,
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on"
  });

  // Re-layout on window resize
  window.addEventListener('resize', () => {
    editor.layout();
  });
}

// Load monaco after fonts are ready to prevent font-width cursor misalignment
if (document.fonts) {
  document.fonts.ready.then(() => {
    require(['vs/editor/editor.main'], initMonaco);
  });
} else {
  require(['vs/editor/editor.main'], initMonaco);
}

// Matplotlib inline plot rendering callback in Javascript
window.print_matplotlib_image = (base64Data) => {
  const container = document.createElement('div');
  container.style.cssText = `
    margin: 12px 0;
    background-color: #ffffff;
    border-radius: 8px;
    padding: 12px;
    display: inline-block;
    max-width: 100%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  const img = document.createElement('img');
  img.src = `data:image/png;base64,${base64Data}`;
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  
  container.appendChild(img);
  consoleElement.appendChild(container);
  consoleElement.scrollTop = consoleElement.scrollHeight;
};

// Initialize Pyodide
async function initPyodide() {
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
    });
    
    // Load micropip to support installing arbitrary pure-python packages from PyPI
    await pyodide.loadPackage("micropip");
    
    isPyodideLoading = false;
    
    // Update loading UI status
    const statusDot = pyodideStatus.querySelector('.status-dot');
    const statusText = pyodideStatus.querySelector('.status-text');
    statusDot.className = 'status-dot ready';
    statusText.textContent = 'Ready';
    
    runBtnText.textContent = 'Run Code';
    runBtn.removeAttribute('disabled');
    
    showToast('Python environment and package loader ready!');
  } catch (error) {
    console.error("Pyodide failed to load:", error);
    const statusText = pyodideStatus.querySelector('.status-text');
    statusText.textContent = 'Load failed';
    showToast('Failed to load Python. Check console.');
  }
}
initPyodide();

// Run Code Logic
runBtn.addEventListener('click', async () => {
  if (isPyodideLoading || !pyodide) return;
  
  // Set button state to running/installing
  runBtn.setAttribute('disabled', 'true');
  runBtnText.textContent = 'Preparing...';
  
  // Reset output panel
  consoleElement.innerHTML = '';
  
  const code = editor.getValue();
  const inputText = document.getElementById('inputTextarea').value;
  
  // Stdin Buffer Setup
  const inputLines = inputText.split('\n').map(line => line + '\n');
  let inputIndex = 0;
  
  // Capture stdout and stderr
  pyodide.setStdout({
    batched: (text) => {
      appendConsoleLine(text, 'stdout');
    }
  });
  
  pyodide.setStderr({
    batched: (text) => {
      appendConsoleLine(text, 'stderr');
    }
  });
  
  pyodide.setStdin({
    stdin: () => {
      if (inputIndex < inputLines.length) {
        return inputLines[inputIndex++];
      }
      return null; // EOF
    }
  });
  
  try {
    appendConsoleLine("Checking code imports and loading required packages...", 'system');
    
    // 1. Automatically load imported packages from official index
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: (msg) => {
        appendConsoleLine(msg, 'system');
      },
      errorCallback: (err) => {
        appendConsoleLine("Package warning: " + err, 'system');
      }
    });
    
    runBtnText.textContent = 'Running...';
    
    // 2. Inject Matplotlib plt.show override so it prints inline images in the console
    const matplotlibSetup = `
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    
    def show_override(*args, **kwargs):
        import io, base64
        fig = plt.gcf()
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=120, bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        # Call JS callback
        from js import print_matplotlib_image
        print_matplotlib_image(img_base64)
        
    plt.show = show_override
except Exception as e:
    pass
`;
    await pyodide.runPythonAsync(matplotlibSetup);
    
    // 3. Execute user's code
    await pyodide.runPythonAsync(code);
    
    appendConsoleLine("\nExecution finished successfully.", 'system');
    
    // Update Variables Inspector if active
    if (document.getElementById('variablesPanel').classList.contains('open')) {
      updateVariables();
    }
  } catch (err) {
    appendConsoleLine(String(err), 'error');
  } finally {
    runBtn.removeAttribute('disabled');
    runBtnText.textContent = 'Run Code';
  }
});

// Console Helper
function appendConsoleLine(text, type) {
  if (!text) return;
  
  const line = document.createElement('div');
  line.className = 'console-line';
  
  if (type === 'error' || type === 'stderr') {
    line.classList.add('error');
  } else if (type === 'system') {
    line.classList.add('system');
  }
  
  line.textContent = text;
  consoleElement.appendChild(line);
  consoleElement.scrollTop = consoleElement.scrollHeight;
}

// Variables Inspector logic
const debugBtn = document.getElementById('debugBtn');
const variablesPanel = document.getElementById('variablesPanel');
const closeVariablesBtn = document.getElementById('closeVariablesBtn');

debugBtn.addEventListener('click', () => {
  variablesPanel.classList.toggle('open');
  if (variablesPanel.classList.contains('open')) {
    updateVariables();
  }
});

closeVariablesBtn.addEventListener('click', () => {
  variablesPanel.classList.remove('open');
});

function updateVariables() {
  if (!pyodide) return;
  
  const variablesContent = document.getElementById('variablesContent');
  
  try {
    // We can evaluate custom python helper to get all non-private globals
    const varsJson = pyodide.runPython(`
import json
import types

user_vars = {}
for k, v in list(globals().items()):
    if not k.startswith('_') and k != 'json' and k != 'types' and k != 'sys' and not isinstance(v, types.ModuleType) and not isinstance(v, types.FunctionType):
        try:
            # Try to serialize, or use repr
            json.dumps(v)
            user_vars[k] = repr(v)
        except:
            user_vars[k] = str(type(v).__name__) + " object"
json.dumps(user_vars)
`);
    const userVars = JSON.parse(varsJson);
    variablesContent.innerHTML = '';
    
    let count = 0;
    for (const [key, value] of Object.entries(userVars)) {
      const item = document.createElement('div');
      item.className = 'variable-item';
      item.innerHTML = `
        <span class="var-name">${key}</span>
        <span class="var-val" title="${value}">${value}</span>
      `;
      variablesContent.appendChild(item);
      count++;
    }
    
    if (count === 0) {
      variablesContent.innerHTML = '<div class="empty-variables-state">No user variables defined. Run some code (e.g. x = 42) to inspect.</div>';
    }
  } catch (err) {
    variablesContent.innerHTML = `<div class="empty-variables-state error">Inspector error: ${err.message}</div>`;
  }
}

// Resizing split panes logic
const mainLayout = document.getElementById('mainLayout');
const editorPanel = document.getElementById('editorPanel');
const rightPanel = document.getElementById('rightPanel');
const verticalSplitter = document.getElementById('verticalSplitter');

let isResizingVertical = false;

verticalSplitter.addEventListener('mousedown', (e) => {
  isResizingVertical = true;
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});

const inputPanel = document.getElementById('inputPanel');
const outputPanel = document.getElementById('outputPanel');
const horizontalSplitter = document.getElementById('horizontalSplitter');

let isResizingHorizontal = false;

horizontalSplitter.addEventListener('mousedown', (e) => {
  isResizingHorizontal = true;
  document.body.style.cursor = 'row-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (isResizingVertical) {
    const layoutRect = mainLayout.getBoundingClientRect();
    const newLeftWidth = e.clientX - layoutRect.left;
    const newRightWidth = layoutRect.width - newLeftWidth - 12; // account for splitter size
    
    if (newLeftWidth > 250 && newRightWidth > 200) {
      editorPanel.style.flex = 'none';
      editorPanel.style.width = `${newLeftWidth}px`;
      rightPanel.style.width = `${newRightWidth}px`;
      if (editor) {
        editor.layout();
      }
    }
  } else if (isResizingHorizontal) {
    const rightPanelRect = rightPanel.getBoundingClientRect();
    const newInputHeight = e.clientY - rightPanelRect.top;
    const newOutputHeight = rightPanelRect.height - newInputHeight - 12;
    
    if (newInputHeight > 60 && newOutputHeight > 60) {
      inputPanel.style.flex = 'none';
      inputPanel.style.height = `${newInputHeight}px`;
    }
  }
});

document.addEventListener('mouseup', () => {
  if (isResizingVertical) {
    isResizingVertical = false;
    document.body.style.cursor = 'default';
  }
  if (isResizingHorizontal) {
    isResizingHorizontal = false;
    document.body.style.cursor = 'default';
  }
});

// Touch support for resizing
verticalSplitter.addEventListener('touchstart', (e) => {
  isResizingVertical = true;
  e.preventDefault();
});

horizontalSplitter.addEventListener('touchstart', (e) => {
  isResizingHorizontal = true;
  e.preventDefault();
});

document.addEventListener('touchmove', (e) => {
  if (e.touches.length === 0) return;
  const touch = e.touches[0];
  if (isResizingVertical) {
    const layoutRect = mainLayout.getBoundingClientRect();
    const newLeftWidth = touch.clientX - layoutRect.left;
    const newRightWidth = layoutRect.width - newLeftWidth - 12;
    if (newLeftWidth > 250 && newRightWidth > 200) {
      editorPanel.style.width = `${newLeftWidth}px`;
      rightPanel.style.width = `${newRightWidth}px`;
      if (editor) editor.layout();
    }
  } else if (isResizingHorizontal) {
    const rightPanelRect = rightPanel.getBoundingClientRect();
    const newInputHeight = touch.clientY - rightPanelRect.top;
    const newOutputHeight = rightPanelRect.height - newInputHeight - 12;
    if (newInputHeight > 60 && newOutputHeight > 60) {
      inputPanel.style.height = `${newInputHeight}px`;
    }
  }
});

document.addEventListener('touchend', () => {
  isResizingVertical = false;
  isResizingHorizontal = false;
});

// Action Buttons
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const ideContainer = document.getElementById('ideContainer');

// Save Code (Download as Python file)
saveBtn.addEventListener('click', () => {
  const code = editor.getValue();
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'script.py';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('File saved as script.py!');
});

// Reset Code
resetBtn.addEventListener('click', () => {
  if (confirm("Reset code back to original default? All changes will be lost.")) {
    editor.setValue(defaultCode);
    showToast('Code reset to default.');
  }
});

// Toggle Fullscreen
fullscreenBtn.addEventListener('click', () => {
  ideContainer.classList.toggle('fullscreen');
  if (editor) {
    // Add small delay so layout adjusts to fullscreen class
    setTimeout(() => { editor.layout(); }, 100);
  }
  showToast(ideContainer.classList.contains('fullscreen') ? 'Fullscreen enabled' : 'Fullscreen disabled');
});

// Helper Toast message
function showToast(message) {
  // Remove any existing toast
  const existing = document.querySelector('.toast-msg');
  if (existing) {
    existing.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `<i data-lucide="info"></i> <span>${message}</span>`;
  document.body.appendChild(toast);
  
  // Re-render lucide icon inside toast
  lucide.createIcons();
  
  // Show animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 50);
  
  // Hide animation
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); }, 300);
  }, 3000);
}

// Floating coding assistant chat popup
const chatAssistantBtn = document.getElementById('chatAssistantBtn');
createChatPopup();

function createChatPopup() {
  const popup = document.createElement('div');
  popup.id = 'chatPopup';
  popup.style.cssText = `
    position: absolute;
    bottom: 74px;
    right: 16px;
    width: 320px;
    height: 400px;
    background-color: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    display: none;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
    font-family: var(--font-sans);
  `;
  
  popup.innerHTML = `
    <div style="background-color: var(--color-primary); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 14px;">
      <span>AI Python Assistant</span>
      <button id="closeChatBtn" style="background: none; border: none; color: white; cursor: pointer;"><i data-lucide="x"></i></button>
    </div>
    <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
      <div style="background-color: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; align-self: flex-start; max-width: 85%;">
        Hello! I can help you write, explain, or debug Python code in this IDE. What are we building today?
      </div>
    </div>
    <div style="padding: 12px; border-top: 1px solid var(--border-color); display: flex; gap: 8px;">
      <input type="text" id="chatInput" placeholder="Ask a question..." style="flex: 1; padding: 8px 12px; border-radius: 20px; border: 1px solid var(--border-color); background-color: var(--bg-input-out); color: var(--text-main); font-size: 13px; outline: none;">
      <button id="sendChatBtn" style="background-color: var(--color-primary); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <i data-lucide="send" style="width: 14px; height: 14px;"></i>
      </button>
    </div>
  `;
  
  document.getElementById('outputPanel').appendChild(popup);
  
  // Bind toggle
  chatAssistantBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popup.style.display === 'none') {
      popup.style.display = 'flex';
      document.getElementById('chatInput').focus();
    } else {
      popup.style.display = 'none';
    }
  });
  
  document.getElementById('closeChatBtn').addEventListener('click', () => {
    popup.style.display = 'none';
  });
  
  // Send message helper
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  
  const sendMessage = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // User Message
    const userMsg = document.createElement('div');
    userMsg.style.cssText = `
      background-color: var(--color-primary);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      align-self: flex-end;
      max-width: 85%;
      word-break: break-word;
    `;
    userMsg.textContent = text;
    chatMessages.appendChild(userMsg);
    
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // AI Response Simulation
    setTimeout(() => {
      const aiMsg = document.createElement('div');
      aiMsg.style.cssText = `
        background-color: rgba(255,255,255,0.03);
        color: var(--text-main);
        padding: 8px 12px;
        border-radius: 8px;
        align-self: flex-start;
        max-width: 85%;
        word-break: break-word;
      `;
      
      let reply = "That's an interesting question! I am running locally as part of your IDE helper. Let me know if you want to inspect variables, run loops, or solve basic code problems.";
      
      const query = text.toLowerCase();
      if (query.includes('hello') || query.includes('hi')) {
        reply = "Hello! How can I assist you with your Python coding today?";
      } else if (query.includes('reverse') && query.includes('string')) {
        reply = "To reverse a string in Python, you can use slicing:\n\n`my_string[::-1]`\n\nFor example:\n`text = \"hello\"`\n`reversed_text = text[::-1]`";
      } else if (query.includes('loop')) {
        reply = "A simple loop in Python:\n\n`for i in range(5):`\n`    print(i)`";
      } else if (query.includes('input')) {
        reply = "To use input in this IDE:\n1. Type your inputs in the **Input** panel on the right.\n2. In your code, call `val = input()`.\n3. Click **Run Code** and the IDE will feed the lines to your script!";
      } else if (query.includes('variable')) {
        reply = "Click the orange bug icon in the bottom left footer to toggle the **Variables Inspector**. Run code like `a = 10` to see it appear there!";
      }
      
      aiMsg.innerHTML = reply.replace(/\n/g, '<br>').replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px; font-family: monospace;">$1</code>');
      chatMessages.appendChild(aiMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      lucide.createIcons();
    }, 800);
  };
  
  document.getElementById('sendChatBtn').addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

// Initial Lucide Icons Render
lucide.createIcons();

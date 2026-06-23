import os
import re
import sys
import uuid
import stat
import shutil
import subprocess
from typing import Tuple

def remove_readonly(func, path, excinfo):
    """
    On Windows, files can sometimes be marked read-only or locked,
    preventing shutil.rmtree from working. This helper removes
    the read-only attribute and retries the removal.
    """
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

def run_tests(language: str, code: str, tests: str) -> Tuple[bool, str]:
    """
    Writes the wrapper code and unit test code to an isolated temporary sandbox directory,
    runs the language-specific test suite via a subprocess, and returns a tuple
    of (test_passed, console_logs).
    """
    # Create a unique sandbox directory under a root 'temp' folder
    root_temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
    os.makedirs(root_temp_dir, exist_ok=True)
    
    run_id = str(uuid.uuid4())
    sandbox_dir = os.path.join(root_temp_dir, f"run_{run_id}")
    os.makedirs(sandbox_dir, exist_ok=True)
    
    language = language.lower().strip()
    timeout_val = 30 if language in ["go", "golang", "java"] else 15
    
    code_filename = ""
    test_filename = ""
    run_args = []
    env = os.environ.copy()
    
    # Enable Java assertions by default
    if "JAVA_TOOL_OPTIONS" not in env:
        env["JAVA_TOOL_OPTIONS"] = "-ea"
    else:
        env["JAVA_TOOL_OPTIONS"] += " -ea"

    try:
        if language in ["python", "py"]:
            code_filename = "client.py"
            test_filename = "test_client.py"
            # Add sandbox directory to PYTHONPATH so pytest can import the client module
            env["PYTHONPATH"] = f"{sandbox_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"
            # Use sys.executable to ensure we use the virtual environment's interpreter
            run_args = [sys.executable, "-m", "pytest", test_filename]
            
        elif language in ["javascript", "js"]:
            code_filename = "client.js"
            test_filename = "test_client.test.js"
            run_args = ["node", test_filename]
            
        elif language in ["typescript", "ts"]:
            code_filename = "client.ts"
            test_filename = "test_client.test.ts"
            
            # Write a basic tsconfig.json so ts-node works consistently
            tsconfig_path = os.path.join(sandbox_dir, "tsconfig.json")
            tsconfig_content = """{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "strict": false,
    "skipLibCheck": true
  }
}"""
            with open(tsconfig_path, "w", encoding="utf-8") as f:
                f.write(tsconfig_content)
                
            run_args = ["npx", "ts-node", "--transpile-only", test_filename]
            
        elif language in ["go", "golang"]:
            code_filename = "client.go"
            test_filename = "client_test.go"
            
            # Initialize a temporary go module to prevent module loading errors
            subprocess.run(
                ["go", "mod", "init", "sandbox"],
                cwd=sandbox_dir,
                capture_output=True,
                timeout=5
            )
            
            run_args = ["go", "test", "-v", code_filename, test_filename]
            
        elif language in ["java"]:
            # Strip package declarations to avoid compile/runtime classpath resolution issues
            code = re.sub(r"^\s*package\s+[\w\.]+;\s*", "", code, flags=re.MULTILINE)
            tests = re.sub(r"^\s*package\s+[\w\.]+;\s*", "", tests, flags=re.MULTILINE)
            
            def find_class_name(source: str, default: str) -> str:
                # Matches public/non-public class names safely
                match = re.search(r"(?:public\s+)?class\s+(\w+)", source)
                return match.group(1) if match else default
                
            code_classname = find_class_name(code, "MyAPIClient")
            test_classname = find_class_name(tests, "TestClient")
            
            code_filename = f"{code_classname}.java"
            test_filename = f"{test_classname}.java"
            
        else:
            raise ValueError(f"Unsupported language for self-healing execution: {language}")
            
        # Write files to sandbox
        code_path = os.path.join(sandbox_dir, code_filename)
        test_path = os.path.join(sandbox_dir, test_filename)
        
        with open(code_path, "w", encoding="utf-8") as f:
            f.write(code)
        with open(test_path, "w", encoding="utf-8") as f:
            f.write(tests)
            
        # Execute the subprocess
        if language == "java":
            # 1. Compile Java files
            compile_process = subprocess.run(
                ["javac", code_filename, test_filename],
                cwd=sandbox_dir,
                capture_output=True,
                text=True,
                timeout=timeout_val
            )
            
            if compile_process.returncode != 0:
                return False, f"Compilation Error:\n{compile_process.stderr}\nStdout:\n{compile_process.stdout}"
                
            # 2. Execute Java test entrypoint
            test_class = test_filename[:-5]
            run_process = subprocess.run(
                ["java", "-ea", test_class],
                cwd=sandbox_dir,
                capture_output=True,
                text=True,
                timeout=timeout_val,
                env=env
            )
            
            success = (run_process.returncode == 0)
            logs = f"Stdout:\n{run_process.stdout}\nStderr:\n{run_process.stderr}"
            return success, logs
            
        else:
            # On Windows, prepend cmd.exe /c for CMD-based tools like npx
            actual_args = run_args
            if os.name == "nt" and run_args and run_args[0] == "npx":
                actual_args = ["cmd.exe", "/c"] + run_args

            # Run the command with strict timeout to prevent CPU hung states
            process = subprocess.run(
                actual_args,
                cwd=sandbox_dir,
                capture_output=True,
                text=True,
                timeout=timeout_val,
                env=env
            )
            
            success = (process.returncode == 0)
            logs = f"Stdout:\n{process.stdout}\nStderr:\n{process.stderr}"
            return success, logs
            
    except subprocess.TimeoutExpired as e:
        return False, f"Execution timed out after 15 seconds.\nStdout:\n{e.stdout}\nStderr:\n{e.stderr}"
    except Exception as e:
        return False, f"Executor encountered an internal exception: {str(e)}"
    finally:
        # Clean up sandbox directory using the Windows-resilient onerror handler
        try:
            shutil.rmtree(sandbox_dir, onerror=remove_readonly)
        except Exception:
            pass

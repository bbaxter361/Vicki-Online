
import json
import time
import os
import sys

# Attempt to import tiktoken, provide guidance if not found
try:
    import tiktoken
except ImportError:
    print("Error: 'tiktoken' library not found. Please install it using: pip install tiktoken", file=sys.stderr)
    sys.exit(1)

TOKEN_USAGE_LOG = os.path.join(os.path.dirname(__file__), '..', 'token_usage.jsonl')

def get_encoding_for_model(model_name: str):
    """Returns the tiktoken encoding for a given model name."""
    try:
        return tiktoken.encoding_for_model(model_name)
    except KeyError:
        # Fallback to a common encoding if model-specific isn't found
        return tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str, model_name: str) -> int:
    """Counts tokens in a given text for a specific model."""
    if not text:
        return 0
    encoding = get_encoding_for_model(model_name)
    return len(encoding.encode(text))

def log_token_usage(model_name: str, prompt: str, response: str = "", timestamp: float = None):
    """
    Logs token usage to a JSONL file.
    model_name: The name of the LLM model used (e.g., "gpt-4", "gemini-pro").
    prompt: The input prompt string.
    response: The LLM's response string.
    timestamp: Optional, Unix timestamp. Defaults to current time.
    """
    if timestamp is None:
        timestamp = time.time()

    prompt_tokens = count_tokens(prompt, model_name)
    response_tokens = count_tokens(response, model_name)
    total_tokens = prompt_tokens + response_tokens

    log_entry = {
        "timestamp": timestamp,
        "model_name": model_name,
        "prompt_tokens": prompt_tokens,
        "response_tokens": response_tokens,
        "total_tokens": total_tokens,
    }

    # Ensure the directory exists
    os.makedirs(os.path.dirname(TOKEN_USAGE_LOG), exist_ok=True)

    with open(TOKEN_USAGE_LOG, 'a') as f:
        f.write(json.dumps(log_entry) + '\n')

    # For debugging/immediate feedback
    # print(f"Logged: Model={model_name}, Prompt Tokens={prompt_tokens}, Response Tokens={response_tokens}, Total Tokens={total_tokens}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python tpm_wrapper.py <model_name> <prompt> [response]", file=sys.stderr)
        sys.exit(1)

    model = sys.argv[1]
    prompt_text = sys.argv[2]
    response_text = sys.argv[3] if len(sys.argv) > 3 else ""

    log_token_usage(model, prompt_text, response_text)
    print(f"Token usage logged for model '{model}'.")


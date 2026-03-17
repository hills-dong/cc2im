#!/bin/bash
# Mock Claude CLI for E2E testing
# Outputs deterministic NDJSON matching Claude Code --output-format stream-json
# Known token counts: input=42, output=15, cache_read=0

# Handle --print-system-prompt flag (used by onboarding test)
for arg in "$@"; do
  if [ "$arg" = "--print-system-prompt" ]; then
    echo "I am Claude, an AI assistant by Anthropic."
    exit 0
  fi
done

# Extract the prompt and session from flags
PROMPT=""
SESSION_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    -p)
      shift
      PROMPT="$1"
      ;;
    --resume)
      shift
      SESSION_ID="$1"
      ;;
  esac
  shift
done

# Generate a session ID if not resuming
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="e2e-mock-session-$(date +%s%N)"
fi

# Emit init event
echo '{"type":"system","subtype":"init","session_id":"'"$SESSION_ID"'"}'

# Small delay to simulate streaming
sleep 0.05

# Generate response based on prompt content
RESPONSE="Hello from mock Claude! I received your message."

# Check for specific test prompts (case-insensitive)
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

if echo "$PROMPT_LOWER" | grep -q "what did i just\|what did you just\|what did we just"; then
  RESPONSE="You asked me a question earlier. I can see our conversation history and I'm referencing your prior message."
elif echo "$PROMPT_LOWER" | grep -q "summarize"; then
  RESPONSE="Here is a summary of our conversation so far. We have been chatting about various topics."
elif echo "$PROMPT_LOWER" | grep -q "bold.*text\|markdown\|inline code"; then
  # Return actual markdown that will render as HTML
  # Stream as single chunk to preserve formatting
  echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Here is **bold text** and `inline code` and a list:\n- Item 1\n- Item 2\n- Item 3"}]}}'
  sleep 0.02
  echo '{"type":"result","subtype":"success","result":"Here is **bold text** and `inline code`","session_id":"'"$SESSION_ID"'","usage":{"input_tokens":42,"output_tokens":15,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}'
  exit 0
elif echo "$PROMPT_LOWER" | grep -q "what can you do"; then
  RESPONSE="I can help you with many tasks including coding, analysis, writing, and more. I am a mock Claude for E2E testing."
elif echo "$PROMPT_LOWER" | grep -q "hello\|hi there"; then
  RESPONSE="Hello! I am a mock Claude assistant for E2E testing. How can I help you today?"
fi

# Stream the response in chunks to simulate real streaming behavior
# Use printf to handle the response properly
CHUNK_SIZE=40
LEN=${#RESPONSE}
POS=0

while [ $POS -lt $LEN ]; do
  CHUNK="${RESPONSE:$POS:$CHUNK_SIZE}"
  # Escape special JSON chars
  CHUNK=$(echo "$CHUNK" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"type":"assistant","message":{"content":[{"type":"text","text":"%s"}]}}\n' "$CHUNK"
  POS=$((POS + CHUNK_SIZE))
  sleep 0.02
done

# Emit result event
ESCAPED_RESPONSE=$(echo "$RESPONSE" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"type":"result","subtype":"success","result":"%s","session_id":"%s","usage":{"input_tokens":42,"output_tokens":15,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}\n' "$ESCAPED_RESPONSE" "$SESSION_ID"

exit 0

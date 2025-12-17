import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
import openai

load_dotenv()

app = Flask(__name__)
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL = "gpt-4o-mini"


def chat_completion(messages):
    resp = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.4,
    )
    return resp.choices[0].message.content.strip()


@app.post("/summarize")
def summarize():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()

    messages = [
        {"role": "system", "content": "Summarize clearly and concisely. Return only the summary."},
        {"role": "user", "content": text},
    ]
    return jsonify({"result": chat_completion(messages)})


@app.post("/define")
def define():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()

    messages = [
        {"role": "system", "content": "Define the term/phrase simply. If single word, give meaning + 2-3 synonyms. Return only the definition."},
        {"role": "user", "content": text},
    ]
    return jsonify({"result": chat_completion(messages)})


@app.post("/translate")
def translate():
    """
    Request body:
      { "text": "...", "target_language": "Spanish" }
    """
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    target_language = (data.get("target_language") or "Spanish").strip()

    messages = [
        {"role": "system", "content": f"Translate the user's text to {target_language}. Return only the translation."},
        {"role": "user", "content": text},
    ]
    return jsonify({"result": chat_completion(messages), "target_language": target_language})


@app.post("/paraphrase")
def paraphrase():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()

    messages = [
        {"role": "system", "content": "Paraphrase using different wording and structure but preserve meaning. Keep similar length. Return only the paraphrase."},
        {"role": "user", "content": text},
    ]
    return jsonify({"result": chat_completion(messages)})


@app.post("/chat")
def chat():
    """
    Request body:
      {
        "messages": [{"role":"user","content":"..."}, {"role":"assistant","content":"..."} ...],
        "selected_text": "optional context"
      }
    """
    data = request.get_json(force=True)
    messages = data.get("messages") or []
    selected_text = (data.get("selected_text") or "").strip()

    # Basic validation / normalization
    cleaned = []
    for m in messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("system", "user", "assistant") and content:
            cleaned.append({"role": role, "content": content})

    system = "You are a helpful assistant. Be clear, direct, and correct."
    if selected_text:
        system += f"\n\nContext (user selection):\n{selected_text}"

    final_messages = [{"role": "system", "content": system}] + cleaned[-20:]  # keep last 20 turns
    return jsonify({"result": chat_completion(final_messages)})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=3000, debug=True)

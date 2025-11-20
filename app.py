'''VERSION 3'''
import os
import openai 
from dotenv import load_dotenv
from flask import Flask, request, jsonify

app = Flask(__name__)
load_dotenv()
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def ask_openai(prompt):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content.strip()

@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.json
    text = data.get('text', '')
    result = ask_openai(f"Summarize the following text concisely. Your summary must be shorter than the original text, include all key points and main ideas, use simple and direct language, and maintain logical flow. Omit minor details unless crucial to understanding. Provide only the summary without additional commentary.:\n\n{text}")
    return jsonify({'result': result})

@app.route('/paraphrase', methods=['POST'])
def paraphrase():
    data = request.json
    text = data.get('text', '')
    result = ask_openai(f"Paraphrase the following text by rewriting it using different words and sentence structures while preserving the exact same meaning. Keep the length similar to the original. Provide only the paraphrased text without additional commentary.:\n\n{text}")
    return jsonify({'result': result})

@app.route('/rewrite', methods=['POST'])
def rewrite():
    data = request.json
    text = data.get('text', '')
    result = ask_openai(f"Rewrite the following text to improve clarity, flow, and readability while maintaining the core message. Use simpler language where appropriate and ensure the text is engaging. Provide only the rewritten text without additional commentary.:\n\n{text}")
    return jsonify({'result': result})

@app.route('/define', methods=['POST'])
def define():
    data = request.json
    text = data.get('text', '')
    result = ask_openai(f"Define the following term or phrase clearly and concisely. If it's a single word, provide the meaning and 2-3 synonyms. If it's a phrase, explain what it means in simple terms. Keep the explanation brief and easy to understand. Provide only the definition without additional commentary.:\n\n{text}")
    return jsonify({'result': result})

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        text = data.get('text', '')
        prompt = f"You are a helpful assistant. User: {text}\nAssistant:"
        result = ask_openai(prompt)
        return jsonify({'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
if __name__ == "__main__":
    app.run(port=3000)      



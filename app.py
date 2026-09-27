import uvicorn
from server.app import app

if __name__ == "__main__":
    # Hugging Face Spaces routes traffic to port 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)

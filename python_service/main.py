from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import json
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from eagleview_parser import EagleViewParser

app = FastAPI()

origins = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins.split(",") if o.strip()] or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/parse")
async def parse(request: Request):
    data = await request.body()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        parser = EagleViewParser(tmp_path)
        report = parser.parse()
        payload = json.loads(parser.to_json(report))
        return JSONResponse({"success": True, "data": payload})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": "parse_failed", "detail": str(e)})
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

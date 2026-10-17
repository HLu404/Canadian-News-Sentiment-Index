from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "article_list.db")

app = FastAPI()

# allow main website to call API
app.add_middleware(
    CORSMiddleware, 
    allow_origins = "http://localhost:5173", 
    allow_credentials = True, 
    allow_methods = ["*"],
    allow_headers= ["*"])

# GET endpoint to retrieve articles 
@app.get("/articles")
def get_daily_articles(): 
    conn = sqlite3.connect(DB_PATH)
    # get rows from article database, turn it into a dictionary and return
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM articles WHERE Date >= ? ", ((str(date.today() - timedelta(days = 31))+"T00:00:00Z"), )).fetchall()
    data = [dict(r) for r in rows]
    conn.close()
    return data


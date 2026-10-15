from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
import sqlite3

app = FastAPI()

# allow main website to call API
app.add_middleware(
    CORSMiddleware, 
    allow_origins = "http://localhost:5173", # or whatever it is. FIX later 
    allow_credentials = True, 
    allow_methods = ["*"],
    allow_headers= ["*"])

# GET endpoint to retrieve articles 
@app.get("/articles")
def get_daily_articles(): 
    conn = sqlite3.connect('article_list.db')
    # get rows from article database, turn it into a dictionary and return
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM articles WHERE Date >= ? ", (str(date.today() - timedelta(days = 1))+"T00:00:00Z"), ).fetchall()
    data = [dict(r) for r in rows]
    conn.close()
    return data
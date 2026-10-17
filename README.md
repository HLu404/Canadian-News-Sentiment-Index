# Canadian News Index

Stress levels in Canadian news, shown on a map of Canada.

> **Status:** runs locally. Not currently hosted.

## What it does

A Python script collects recent English-language articles from Canadian publishers and scores each headline with a pretrained sentiment model. The score is weighted by topic, so a negative story about politics counts for more than a negative story about sports. Each article ends up with a stress rating from 0 (calm) to 10 (high). Articles are placed on the map by province, colored from green to red, and stored in a database so the history builds up over time. A React page shows the map, an average gauge, and the most stressful headlines for each time window.

## Screenshots

![Main view](<img width="1469" height="810" alt="image" src="https://github.com/user-attachments/assets/c16a0e24-7d88-4faa-a2de-23675224b77c" />)
![Selected article](<img width="1467" height="795" alt="image" src="https://github.com/user-attachments/assets/70a72297-1613-4d48-ac28-f3b82b0f7809" />
)
![About tab](<img width="1468" height="796" alt="image" src="https://github.com/user-attachments/assets/b4456263-d6e8-4103-ad3b-42564955d151" />
)

## How it works

1. **Collect.** For each of nine topics, the script requests articles from the FreeNewsAPI `/v1/news` endpoint (`country=ca`, `language=en`, published since yesterday). It pages through results with a per-topic offset and stops when it hits the article cap or runs out of API calls.
2. **Get details.** For each article it calls `/v1/details` to get the body text, thumbnail, and original URL.
3. **Find the province.** It looks for city names (for example "Calgary" or "Halifax") in the title first, then in the body, and maps the first match to a province. Articles that name no known place are labeled `National`.
4. **Score.** The default HuggingFace sentiment pipeline classifies the headline as positive or negative with a confidence value. The article's score is:

   `topic weight × model confidence × (1.25 if negative, 0.75 if positive)`

   Topic weights run from 3 (gaming, sports, celebrities) to 8 (politics), so scores fall between 0 and 10.
5. **Store.** Results are saved to SQLite. The article URL is unique, so rerunning the script never creates duplicates.
6. **Serve.** A FastAPI endpoint, `GET /articles`, returns the last 31 days of articles as JSON.
7. **Display.** The React frontend fetches that data and draws it.

## Frontend

- **Map.** Each dot is one article. The map image is drawn onto a hidden canvas to find the land area of each province, and dots are placed on a grid inside it, so they never land in the sea or in a neighboring province. Dots shrink as a province gets more articles. If a province still has no room, the oldest extras are left off the map but still counted in the stats.
- **Tabs.** National, Today, This week, This month, and About. The time windows are filtered in the browser by publish date.
- **Gauge.** Shows the average score for the current tab, labeled LOW (under 4), MEDIUM (4 to 7), or HIGH (7 and up).
- **Article card.** Clicking a dot or a headline shows the thumbnail, a linked title, and a green-to-red score bar.

## Tech stack

- **Backend:** Python, FastAPI, SQLite, `requests`
- **NLP:** HuggingFace Transformers (default sentiment pipeline), PyTorch
- **Frontend:** React, Vite, plain CSS
- **Data source:** FreeNewsAPI

## Project structure

```
backend/
  main.py                 FastAPI app (GET /articles)
  collect_articles.py     collects, locates, scores and stores articles
  requirements.txt
  .env                    your API key (not committed)
  article_list.db         created when the collector runs (not committed)
frontend/
  src/
    App.jsx               the page
    App.css               styles
    assets/               map SVG
```

## Running it locally

**You need:** Python 3.9 to 3.12 (PyTorch does not support the newest Python versions yet), Node.js, and a free [FreeNewsAPI](https://www.freenewsapi.io/) key.

**1. Backend setup**

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env` with your key:

```
NEWS_API_KEY=your-key-here
```

**2. Collect articles.** The first run downloads the sentiment model (about 270 MB).

```bash
python collect_articles.py
```

`max_articles` at the top of the script sets how many articles to collect. Use a small number for a test run.

**3. Start the API**

```bash
uvicorn main:app --reload
```

Check `http://localhost:8000/articles`. It should return JSON.

**4. Start the frontend** in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The database is not committed, so the map is empty until you run the collector at least once. Run the collector once a day (cron or launchd) to keep adding articles.

## Design decisions and limitations

- **Topic weights are hand-picked.** I chose them by judgment about how stressful each kind of news usually is. They are not derived from data, so the index is an informal gauge of the news mood, not a scientific measurement.
- **Default sentiment model.** I used the default HuggingFace pipeline (a DistilBERT model fine-tuned on SST-2) because the goal was the pipeline and the system around it, not the model. It was trained on movie reviews, so it can misjudge news headlines. A model fine-tuned on news would likely do better.
- **Province detection is keyword matching.** It only knows the cities in the lookup table, so many articles come back as `National`. A city with the same name as another place can also match the wrong province (for example, London).
- **Publisher country is not story location.** The API filter returns articles from Canadian publishers, which are not always about Canada. Articles that name no Canadian place are counted as national.
- **Confidence, not intensity.** The sentiment model's score is how sure it is of its label, not how negative the text is. The score uses it as a rough stand-in for intensity.
- **SQLite and a local API.** That is enough for one user. A hosted version with many users would need a different database and a rate limit on the API.

## Credits

- News data from [FreeNewsAPI](https://www.freenewsapi.io/).
- Sentiment model: the default Hugging Face `sentiment-analysis` pipeline.
- Map: Canada provinces SVG from Wikimedia Commons (add the author and license from the file's page here).

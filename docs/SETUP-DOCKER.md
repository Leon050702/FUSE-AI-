# Run FUSE-AI with Docker

1. Install Docker Desktop → https://www.docker.com/products/docker-desktop
   Open it. Wait for "Engine running".

2. Get a DeepSeek API key → https://platform.deepseek.com/api_keys

3. Get the newest code:
   - First time:
     ```
     git clone https://github.com/Leon050702/FUSE-AI-.git
     cd FUSE-AI-
     ```
   - Already cloned before:
     ```
     git pull
     ```

4. In the `backend` folder:
   ```
   copy .env.example .env
   ```
   Open `backend/.env`, fill in:
   ```
   DEEPSEEK_API_KEY=your_key_here
   JWT_SECRET=any-long-random-text-min-32-chars
   ```

5. In the project root folder:
   ```
   docker compose up --build
   ```

6. Open → http://localhost:3001

---

Stop: `Ctrl + C`
Start again: `docker compose up`
Get latest code later: `git pull` then `docker compose up --build`

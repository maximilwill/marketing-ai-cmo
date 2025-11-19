# marketing-ai-cmo

Backend orchestrator for Max's **Marketing Director GPT (CMO)**.

This server lets your Custom GPT act like a true CMO:
 - Manage a team of specialist AI marketing agents
 - Create stateful sessions per brand/client
 - Assign tasks to specific agents or auto-route them
 - Use OpenAI models under the hood

## 🚀 Run Locally

### Install dependencies

```bash
npm install
```

### Environment variable

Create a file named `.env` (not committed) and add:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Start the server

```bash
npm start
```

The server will run at `http://localhost:3000`.

## 🌐 Deploying to Render

1. Push this repo to GitHub.
2. Create a new Web Service on Render and connect the repo.
3. Use build command `npm install` and start command `npm start`.
4. Add environment variable `OPENAI_API_KEY`.
5. Deploy and use the provided URL in your Custom GPT's Action schema.

## 📚 API Overview

### Sessions

- `POST /sessions` – create a new session.
- `GET /sessions/:id` – get session context.
- `PATCH /sessions/:id/context` – update session context.

### Agents

- `GET /team/agents` – list agents.
- `POST /team/agents` – create or update an agent.
- `GET /team/agents/:agent_id` – get an agent's details.

### Tasks

- `POST /team/tasks` – assign a task to an agent.
- `GET /team/tasks` – list tasks.
- `GET /team/tasks/:task_id` – get a specific task.

### Auto Routing

- `POST /team/route` – auto-select the best agent for a high-level request.

## 🧠 Usage with Custom GPT

Add an Action to your Custom GPT pointing at this server's OpenAPI schema. Then instruct your GPT to create sessions, manage agents, and delegate tasks via the exposed API endpoints.
// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory stores
const agents = new Map();
const tasks = new Map();
const sessions = new Map();

// Simple ID generator
const makeId = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

// Session routes
app.post("/sessions", (req, res) => {
  const { name, brand, context = {}, owner_id } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }
  const id = makeId("session");
  const session = {
    id,
    name,
    brand: brand || "",
    context,
    owner_id: owner_id || null,
    created_at: new Date().toISOString(),
  };
  sessions.set(id, session);
  res.json(session);
});

app.get("/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

app.patch("/sessions/:id/context", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const { context = {} } = req.body || {};
  session.context = {
    ...(session.context || {}),
    ...context,
  };
  sessions.set(session.id, session);
  res.json(session);
});

// Agent routes
app.get("/team/agents", (req, res) => {
  res.json({ agents: Array.from(agents.values()) });
});

app.post("/team/agents", (req, res) => {
  const {
    id,
    name,
    role,
    specialization,
    system_prompt,
    metadata = {},
  } = req.body || {};

  if (!name || !role || !specialization) {
    return res.status(400).json({
      error: "name, role, and specialization are required",
    });
  }

  const agentId = id || makeId("agent");
  const agent = {
    id: agentId,
    name,
    role,
    specialization,
    system_prompt: system_prompt || "",
    metadata,
  };
  agents.set(agentId, agent);
  res.json(agent);
});

app.get("/team/agents/:agent_id", (req, res) => {
  const agent = agents.get(req.params.agent_id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json(agent);
});

// Task routes
app.get("/team/tasks", (req, res) => {
  const { status } = req.query;
  let allTasks = Array.from(tasks.values());
  if (status) {
    allTasks = allTasks.filter((t) => t.status === status);
  }
  res.json({ tasks: allTasks });
});

app.get("/team/tasks/:task_id", (req, res) => {
  const task = tasks.get(req.params.task_id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
});

app.post("/team/tasks", async (req, res) => {
  const {
    agent_id,
    description,
    priority = "normal",
    context = {},
    session_id,
    sync = true,
  } = req.body || {};

  if (!description) {
    return res.status(400).json({ error: "description is required" });
  }

  let targetAgentId = agent_id;
  if (!targetAgentId) {
    const firstAgent = Array.from(agents.values())[0];
    if (!firstAgent) {
      return res.status(400).json({
        error: "No agents available. Create agents first.",
      });
    }
    targetAgentId = firstAgent.id;
  }

  const agent = agents.get(targetAgentId);
  if (!agent) {
    return res.status(400).json({ error: "Agent not found" });
  }

  const taskId = makeId("task");
  const now = new Date().toISOString();

  const session = session_id ? sessions.get(session_id) : null;
  const mergedContext = {
    ...(session?.context || {}),
    ...context,
  };

  const task = {
    id: taskId,
    agent_id: targetAgentId,
    description,
    status: "pending",
    outputs: [],
    started_at: now,
    completed_at: null,
    error: null,
    priority,
    session_id,
  };
  tasks.set(taskId, task);

  if (!sync) {
    return res.json({ task });
  }

  try {
    task.status = "in_progress";
    tasks.set(taskId, task);

    const messages = [
      { role: "system", content: agent.system_prompt || "" },
      {
        role: "user",
        content: `Task:\n${description}\n\nContext:\n${JSON.stringify(
          mergedContext,
          null,
          2
        )}`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.7,
    });

    const reply =
      completion.choices?.[0]?.message?.content || "No response generated.";

    task.status = "completed";
    task.completed_at = new Date().toISOString();
    task.outputs = [reply];
    tasks.set(taskId, task);

    res.json({ task });
  } catch (err) {
    task.status = "failed";
    task.error = err.message;
    task.completed_at = new Date().toISOString();
    tasks.set(taskId, task);

    res.status(500).json({ error: "Agent failed", task });
  }
});

// Route endpoint
app.post("/team/route", async (req, res) => {
  const { description, session_id, context = {} } = req.body || {};

  if (!description) {
    return res.status(400).json({ error: "description is required" });
  }

  const allAgents = Array.from(agents.values());
  if (!allAgents.length) {
    return res.status(400).json({
      error: "No agents available to route tasks.",
    });
  }

  const session = session_id ? sessions.get(session_id) : null;
  const mergedContext = {
    ...(session?.context || {}),
    ...context,
  };

  const routerPrompt = `
You are a routing engine. Based on the list of agents and the task description,
choose the 1 best agent and return JSON:
{
  "agent_id": "...",
  "reason": "why this agent",
  "subtask": "what this agent should do"
}
`;
  const agentsListStr = JSON.stringify(
    allAgents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      specialization: a.specialization,
    })),
    null,
    2
  );
  const routerCompletion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: routerPrompt },
      {
        role: "user",
        content: `Task:\n${description}\n\nAgents:\n${agentsListStr}`,
      },
    ],
    temperature: 0.3,
  });

  let routing;
  try {
    routing = JSON.parse(routerCompletion.choices[0].message.content);
  } catch (err) {
    return res.status(500).json({
      error: "Router produced invalid JSON",
      details: routerCompletion.choices[0].message.content,
    });
  }

  const chosenAgent = agents.get(routing.agent_id);
  if (!chosenAgent) {
    return res.status(400).json({
      error: "Router selected an invalid agent ID.",
    });
  }

  // Perform the delegated task
  const taskId = makeId("task");
  const now = new Date().toISOString();

  const task = {
    id: taskId,
    agent_id: chosenAgent.id,
    description: routing.subtask || description,
    status: "pending",
    outputs: [],
    session_id,
    started_at: now,
  };
  tasks.set(taskId, task);

  try {
    task.status = "in_progress";
    tasks.set(taskId, task);

    const messages = [
      { role: "system", content: chosenAgent.system_prompt },
      {
        role: "user",
        content: `Task:\n${task.description}\n\nContext:\n${JSON.stringify(
          mergedContext,
          null,
          2
        )}`,
      },
    ];
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.7,
    });

    task.status = "completed";
    task.completed_at = new Date().toISOString();
    task.outputs = [
      completion.choices[0].message.content || "No output.",
    ];
    tasks.set(taskId, task);

    res.json({
      summary: `Task routed to ${chosenAgent.name}`,
      routing,
      task,
    });
  } catch (err) {
    task.status = "failed";
    task.error = err.message;
    task.completed_at = new Date().toISOString();
    tasks.set(taskId, task);

    res.status(500).json({ error: "Routed task failed", task });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Marketing AI CMO Orchestrator is running on port ${PORT}`);
});
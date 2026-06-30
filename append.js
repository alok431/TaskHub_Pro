const fs = require('fs');

const jsCode = `
/* ==========================================================================
   CREATE TASK FLOW
   ========================================================================== */
function openCreateTaskModal() { 
    const m = document.getElementById("create-task-modal"); 
    if(m) m.classList.add("active"); 
}
function closeCreateTaskModal() { 
    const m = document.getElementById("create-task-modal"); 
    if(m) m.classList.remove("active"); 
}

async function submitCreateTask() {
  const title = document.getElementById("create-task-title").value.trim();
  const desc = document.getElementById("create-task-desc").value.trim();
  const reward = document.getElementById("create-task-reward").value;
  const url = document.getElementById("create-task-url").value.trim();
  
  if(!title || !desc || !reward || !url) {
    alert("Please fill all fields.");
    return;
  }
  
  const btn = document.getElementById("pay-ton-btn");
  const originalText = btn.innerText;
  btn.innerText = "Processing TON Transaction...";
  btn.disabled = true;
  
  // Simulate TON Payment Delay
  setTimeout(async () => {
    try {
      const response = await fetch(\`\${API_BASE_URL}/api/tasks/create\`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": getAuthHeader()
        },
        body: JSON.stringify({ title, description: desc, reward: parseInt(reward), url, task_type: "partner" })
      });
      
      if(response.ok) {
        alert("Task created successfully! Paid with TON.");
        closeCreateTaskModal();
        document.getElementById("create-task-title").value = "";
        document.getElementById("create-task-desc").value = "";
        document.getElementById("create-task-reward").value = "";
        document.getElementById("create-task-url").value = "";
        if(activeTab === "tasks") {
          loadTabContent("tasks");
        }
      } else {
        const data = await response.json();
        alert("Failed: " + (data.error || "Unknown Error"));
      }
    } catch(err) {
      alert("Network error creating task.");
      console.error(err);
    } finally {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  }, 2000);
}
`;

fs.appendFileSync('frontend/app.js', jsCode);

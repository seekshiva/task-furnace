console.log("🔥 Task Furnace is starting...");

interface Task {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "failed";
}

class TaskFurnace {
  private tasks: Task[] = [];
  private running = false;

  start(): void {
    this.running = true;
    console.log("🚀 Task Furnace is now running");
    this.processLoop();
  }

  stop(): void {
    this.running = false;
    console.log("🛑 Task Furnace stopped");
  }

  addTask(description: string): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      description,
      status: "pending",
    };
    this.tasks.push(task);
    console.log(`📋 Task added: ${task.description}`);
    return task;
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      const pendingTask = this.tasks.find((t) => t.status === "pending");

      if (pendingTask) {
        await this.executeTask(pendingTask);
      } else {
        await this.sleep(1000);
      }
    }
  }

  private async executeTask(task: Task): Promise<void> {
    task.status = "in-progress";
    console.log(`⚙️  Executing: ${task.description}`);

    try {
      await this.sleep(100);
      task.status = "completed";
      console.log(`✅ Completed: ${task.description}`);
    } catch (error) {
      task.status = "failed";
      console.error(`❌ Failed: ${task.description}`, error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus(): { running: boolean; totalTasks: number; pendingTasks: number } {
    return {
      running: this.running,
      totalTasks: this.tasks.length,
      pendingTasks: this.tasks.filter((t) => t.status === "pending").length,
    };
  }
}

const furnace = new TaskFurnace();

furnace.addTask("Initialize task queue");
furnace.addTask("Connect to AI agent");
furnace.start();

setTimeout(() => {
  console.log("\n📊 Status:", furnace.getStatus());
  furnace.stop();
  process.exit(0);
}, 3000);

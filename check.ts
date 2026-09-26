import { prisma } from './src/lib/db.ts';

async function main() {
  const project = await prisma.project.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      scenes: {
        orderBy: { order: 'asc' },
        include: {
          jobs: { orderBy: { createdAt: 'desc' } }
        }
      }
    }
  });

  if (!project) return;
  console.log(`Project: ${project.id}`);
  for (const scene of project.scenes) {
    if (scene.order >= 9 && scene.order <= 12) {
      console.log(`\nScene ${scene.order} (${scene.id}): status=${scene.status}`);
      for (const job of scene.jobs) {
        console.log(`  Job ${job.id}: state=${job.state}, attempts=${job.attempts}, error=${job.lastError}, taskId=${job.providerTaskId}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { backfillGitHubIssues } from '@/services/backlog';

async function main() {
  const results = await backfillGitHubIssues();
  if (!results.length) {
    console.log('No backlog issues needed backfill.');
    return;
  }

  for (const result of results) {
    console.log(`${result.id} -> #${result.issueNumber}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { ComingSoon } from '@/components/coming-soon';

export default function SystemPage() {
  return (
    <ComingSoon
      featureName="System Orchestrator"
      description="A live health dashboard monitoring 28 scheduled processes across 7 execution frequencies. This requires a real backend task scheduler — it cannot run in the browser."
      requirements={[
        'Python backend with Celery + Redis (task queue)',
        'Kubernetes CronJobs or Airflow/Dagster (DAG orchestration)',
        'Prometheus metrics collection + Grafana dashboard',
        'PagerDuty or Opsgenie for failure alerting',
        'Actual scheduled tasks (price refresh, scoring, reports) running server-side',
      ]}
    />
  );
}

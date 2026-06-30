import { ComingSoon } from '@/components/coming-soon';

export default function ShadowPortfolioPage() {
  return (
    <ComingSoon
      featureName="RL Shadow Portfolio"
      description="A reinforcement learning agent that trades a simulated portfolio to test strategies before risking real capital. The technical specification exists (RL-AGENT-SPEC.md) but the Python backend has not been built."
      requirements={[
        'Python backend with Stable-Baselines3 (PPO algorithm)',
        'OpenAI Gym trading environment with 15-feature state space',
        '50,000 training episodes on 5 years of historical data',
        'GPU infrastructure for training (~$50 compute cost)',
        'FastAPI server for daily inference and position tracking',
        'Estimated build time: 6 weeks of ML engineering',
      ]}
    />
  );
}

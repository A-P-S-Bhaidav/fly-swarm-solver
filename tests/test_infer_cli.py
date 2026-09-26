import asyncio
from server.inference import run_inference

async def test_type(ctype: str):
    print(f"\n--- Testing {ctype} inference (N=3 flies) ---")
    async for event in run_inference(ctype, "medium", n_flies=3):
        if event["event"] == "step":
            pass
        elif event["event"] == "result":
            print(f"  Ground truth: {event['ground_truth']}")
            print(f"  Fly answers:  {event['fly_answers']}")
            print(f"  Swarm answer: {event['swarm_answer']}")
            print(f"  Correct:      {event['correct']}")
            print(f"  Single corr:  {event['single_correct']}")
            print(f"  Confidences:  {[round(c, 3) for c in event['confidences']]}")

async def main():
    for ctype in ["rotate", "broken_circle", "text", "math", "scatter"]:
        await test_type(ctype)

if __name__ == "__main__":
    asyncio.run(main())

"""Script run on the build instances in order to let the running instances
know that a build is ready
"""
from deployment.itgs import Itgs
import asyncio


EXPECTED_SUBSCRIBERS = 1


async def main():
    async with Itgs() as itgs:
        redis = await itgs.redis()
        num_delivered = await redis.publish(
            b"updates:frontend-ssr-web:build_ready", b"1"
        )
        slack = await itgs.slack()
        if num_delivered != EXPECTED_SUBSCRIBERS:
            await slack.send_ops_message(
                f"frontend-ssr-web build server `on_build_ready` expected {EXPECTED_SUBSCRIBERS} subscriber(s), got {num_delivered}"
            )
        else:
            await slack.send_ops_message(
                f"frontend-ssr-web build server `on_build_ready` notified {num_delivered} subscriber(s)"
            )


if __name__ == "__main__":
    asyncio.run(main())

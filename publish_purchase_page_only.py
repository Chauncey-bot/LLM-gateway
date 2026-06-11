#!/usr/bin/env python3
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    local = root / "prod_PurchaseSubscriptionView-DDDC2WHV.js"
    remote = Path("/var/www/zhisales-site/assets/PurchaseSubscriptionView-DDDC2WHV.js")

    if not local.exists():
        raise SystemExit("本地购买页产物缺失，请确认 prod_PurchaseSubscriptionView-DDDC2WHV.js 已更新。")

    remote.parent.mkdir(parents=True, exist_ok=True)
    remote.write_text(local.read_text())
    print("已仅发布购买页产物：", remote)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
诊断图片生成定价问题
检查provider_pricing和provider_balances表配置
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# 加载环境变量
env_path = os.path.join(os.path.dirname(__file__), 'mxmdata/.env')
load_dotenv(env_path)

def get_db_connection():
    """获取数据库连接"""
    # 尝试多种连接方式
    connections = [
        os.getenv('SUPABASE_DB_URL'),
        os.getenv('DATABASE_URL'),
        os.getenv('SUPABASE_URL')
    ]

    conn_str = None
    for conn in connections:
        if conn:
            conn_str = conn
            break

    if not conn_str:
        # 默认本地开发连接
        conn_str = "postgres://postgres:postgres@localhost:5432/postgres"
        print(f"⚠️  使用默认连接: {conn_str}")

    # 如果conn_str是PostgREST URL，需要转换为数据库连接
    if conn_str.startswith('http://') or conn_str.startswith('https://'):
        print(f"⚠️  检测到HTTP URL，需要数据库连接字符串而不是HTTP API URL")
        print(f"   请设置 SUPABASE_DB_URL=postgres://postgres:postgres@localhost:5432/postgres")
        return None

    try:
        conn = psycopg2.connect(conn_str)
        return conn
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        print(f"   连接字符串: {conn_str[:50]}...")
        return None

def check_tables(conn):
    """检查表是否存在"""
    cursor = conn.cursor()

    tables = ['provider_pricing', 'provider_balances', 'provider_usage_records']

    print("\n=== 检查表是否存在 ===")
    for table in tables:
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = %s
            )
        """, (table,))
        exists = cursor.fetchone()[0]
        status = "✅" if exists else "❌"
        print(f"{status} {table}: {'存在' if exists else '不存在'}")

    cursor.close()
    return all([table in ['provider_pricing', 'provider_balances'] for table in tables[:2]])

def check_deer_pricing(conn):
    """检查deer provider定价配置"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    print("\n=== 检查DeerAPI定价配置 ===")

    # 检查provider_pricing表中deer的记录
    cursor.execute("""
        SELECT provider, scope, model_key, charge_mode,
               unit_price, currency,
               platform_unit_price, platform_min_charge
        FROM provider_pricing
        WHERE provider = 'deer'
        ORDER BY scope, model_key
    """)

    records = cursor.fetchall()

    if not records:
        print("❌ provider_pricing表中没有deer provider的定价记录")
        print("   需要为以下模型添加定价:")
        print("   - nano-banana (graph scope)")
        print("   - seedream-4 (graph scope)")
        print("   - flux-2-pro (graph scope)")
        return False

    print(f"✅ 找到 {len(records)} 条deer provider定价记录")

    # 检查graph scope的记录
    graph_records = [r for r in records if r['scope'] == 'graph']
    if not graph_records:
        print("⚠️  没有graph scope的定价记录（图片生成需要）")

    # 检查具体模型
    required_models = ['nano-banana', 'seedream-4', 'flux-2-pro']
    found_models = set([r['model_key'] for r in records])

    print("\n📋 模型配置检查:")
    for model in required_models:
        if model in found_models:
            model_records = [r for r in records if r['model_key'] == model]
            graph_record = next((r for r in model_records if r['scope'] == 'graph'), None)
            default_record = next((r for r in model_records if r['scope'] == 'default'), None)

            status = "✅" if graph_record or default_record else "⚠️ "
            scope_info = []
            if graph_record:
                scope_info.append(f"graph: {graph_record['unit_price']} {graph_record['currency']}")
            if default_record:
                scope_info.append(f"default: {default_record['unit_price']} {default_record['currency']}")

            print(f"   {status} {model}: {', '.join(scope_info) if scope_info else '未配置'}")
        else:
            print(f"   ❌ {model}: 未配置")

    # 显示详细记录
    print("\n📊 详细定价信息:")
    for i, record in enumerate(records, 1):
        platform_price = record['platform_unit_price'] if record['platform_unit_price'] is not None else '未设置'
        min_charge = record['platform_min_charge'] if record['platform_min_charge'] is not None else '无'
        print(f"   [{i}] {record['provider']}.{record['scope']}.{record['model_key']}")
        print(f"       计费模式: {record['charge_mode']}")
        print(f"       成本单价: {record['unit_price']} {record['currency']}")
        print(f"       平台价格: {platform_price} MXM-TOKEN")
        print(f"       最低收费: {min_charge} MXM-TOKEN")

    cursor.close()
    return len(graph_records) > 0

def check_deer_balance(conn):
    """检查deer provider余额"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    print("\n=== 检查DeerAPI余额 ===")

    cursor.execute("""
        SELECT provider, balance, currency, updated_at
        FROM provider_balances
        WHERE provider = 'deer'
    """)

    record = cursor.fetchone()

    if not record:
        print("❌ provider_balances表中没有deer provider的余额记录")
        print("   需要添加初始余额: INSERT INTO provider_balances (provider, balance, currency) VALUES ('deer', 100.00, 'USD')")
        cursor.close()
        return False

    balance = float(record['balance'])
    status = "✅" if balance > 0 else "❌"

    print(f"{status} deer provider余额: {balance} {record['currency']}")

    if balance <= 0:
        print("⚠️  余额不足或为0，需要充值")
        print(f"   最后更新: {record['updated_at']}")

    cursor.close()
    return balance > 0

def check_charge_modes(conn):
    """检查计费模式配置"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    print("\n=== 检查计费模式 ===")

    cursor.execute("""
        SELECT DISTINCT charge_mode, COUNT(*) as count
        FROM provider_pricing
        WHERE provider = 'deer'
        GROUP BY charge_mode
        ORDER BY count DESC
    """)

    modes = cursor.fetchall()

    if not modes:
        print("❌ 没有配置计费模式")
        return False

    print("📊 计费模式分布:")
    for mode in modes:
        print(f"   {mode['charge_mode']}: {mode['count']} 条记录")

    # 检查graph scope是否使用正确的计费模式
    cursor.execute("""
        SELECT charge_mode, COUNT(*) as count
        FROM provider_pricing
        WHERE provider = 'deer' AND scope = 'graph'
        GROUP BY charge_mode
    """)

    graph_modes = cursor.fetchall()

    if graph_modes:
        print("\n📈 Graph scope计费模式:")
        for mode in graph_modes:
            expected = 'per_image' if mode['charge_mode'] == 'per_image' else '⚠️ 可能需要调整'
            print(f"   {mode['charge_mode']}: {mode['count']} 条记录 ({expected})")

    cursor.close()
    return True

def main():
    print("🔍 图片生成定价诊断工具")
    print("=" * 50)

    # 检查环境变量
    print("📋 环境变量检查:")
    env_vars = ['SUPABASE_DB_URL', 'DATABASE_URL', 'SUPABASE_URL']
    for var in env_vars:
        value = os.getenv(var)
        status = "✅" if value else "⚠️ "
        print(f"   {status} {var}: {'已设置' if value else '未设置'}")
        if value and len(value) > 60:
            print(f"      值: {value[:60]}...")

    # 连接数据库
    conn = get_db_connection()
    if not conn:
        print("\n❌ 无法连接到数据库")
        print("\n💡 解决方案:")
        print("1. 确保PostgreSQL服务正在运行: docker-compose up -d postgres")
        print("2. 在mxmdata/.env中设置数据库连接:")
        print("   SUPABASE_DB_URL=postgres://postgres:postgres@localhost:5432/postgres")
        print("3. 运行迁移创建表: pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing")
        return 1

    try:
        # 检查表
        tables_ok = check_tables(conn)
        if not tables_ok:
            print("\n❌ 缺少必要的表")
            print("\n💡 运行以下命令创建表:")
            print("   pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing")
            print("   pnpm --filter @mxmai/mxmdata run migrate:provider-balances")
            return 1

        # 检查定价配置
        pricing_ok = check_deer_pricing(conn)

        # 检查余额
        balance_ok = check_deer_balance(conn)

        # 检查计费模式
        modes_ok = check_charge_modes(conn)

        # 总结
        print("\n" + "=" * 50)
        print("📋 诊断总结:")

        issues = []
        if not pricing_ok:
            issues.append("❌ DeerAPI定价配置不完整")
        if not balance_ok:
            issues.append("❌ DeerAPI余额不足或未配置")

        if not issues:
            print("✅ 所有检查通过！图片生成应该可以正常工作")
            print("\n💡 如果仍然出现'服务价格报错'，请检查:")
            print("   - 确保服务已重启以加载新配置")
            print("   - 检查mxmcgi服务日志")
            print("   - 验证实际API调用是否正确传递provider和model参数")
        else:
            print("\n".join(issues))
            print("\n💡 解决方案:")
            print("1. 运行迁移创建表（如果未创建）")
            print("2. 执行SQL插入定价数据（参考PRICING_SETUP_GUIDE.md）")
            print("3. 添加provider余额")
            print("4. 重启mxmcgi服务")

        return 0 if not issues else 1

    except Exception as e:
        print(f"❌ 诊断过程中出错: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    sys.exit(main())
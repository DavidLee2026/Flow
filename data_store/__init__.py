"""绘心 Flow · 数据层包

数据持久化（记录/画像/社区/埋点）+ 业务辅助逻辑。
从 data_store.py 拆分为子模块，本文件 re-export 保持 `from data_store import X` 兼容。
"""
from .events import log_event, get_funnel_stats
from .masters import (
    RECOMMENDATION_IMAGES,
    MASTER_IMG_MAP,
    MASTER_INDEX,
    MASTER_TO_REC,
    _localize_url,
    parse_master_files,
)
from .content import (
    RECOMMENDATION_POOL,
    MAX_VISIBLE_LEVEL,
    THEME_LIBRARY,
    DIFFICULTY_LABELS,
)
from .records import load_records, save_records
from .community import load_community_posts, save_community_posts
from .profile import load_profile, save_profile, _profile_defaults
from .progress import (
    get_drawing_stage,
    get_milestone,
    _layers_to_text,
    _record_date,
    calc_streak,
    calc_max_streak,
    get_recommendation,
)

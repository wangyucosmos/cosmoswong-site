# 补时计算器数据地图

ATTENDANCE_DB独立D1：users（加盐密码哈希）、sessions（令牌哈希）、records（user_id/date联合主键及revision）、throttles。Cookie路径/api/attendance。请求中的user_id不会决定读写范围。整批JSON事务只需两条SQL，兼容多月备份；revision冲突整批回滚。

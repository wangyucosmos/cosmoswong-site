// /desk 各表的字段定义与校验，实体在 public/assets/desk/schema.mjs（v5 起）：
// 演示模式（/desk-demo）在浏览器里跑同一套校验，所以挪到了公开目录；服务端照旧从这里引用，两边永远是同一份。
export * from '../../public/assets/desk/schema.mjs';

# 多阶段构建：Node 负责编译，nginx 负责托管静态文件
# 构建：docker build -t star-arc .
# 运行：docker run -p 8080:80 star-arc

# —— 构建阶段 ——
FROM node:20-alpine AS build
WORKDIR /app

# 先只拷依赖清单，充分利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# —— 运行阶段 ——
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

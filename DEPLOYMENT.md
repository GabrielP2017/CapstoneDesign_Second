# Cargomon.kr 배포 가이드

## HTTPS 설정 가이드

### 문제 해결: HTTP만 연결되고 HTTPS가 안 되는 경우

이 가이드는 서버에서 HTTPS를 제대로 설정하는 방법을 설명합니다.

## 1. SSL 인증서 발급 (Let's Encrypt 사용)

```bash
# Certbot 설치 (Ubuntu/Debian)
sudo apt update
sudo apt install certbot python3-certbot-nginx

# SSL 인증서 발급 및 자동 설정
sudo certbot --nginx -d cargomon.kr -d www.cargomon.kr

# 인증서 자동 갱신 테스트
sudo certbot renew --dry-run
```

## 2. Nginx 설정

### 2.1 설정 파일 복사 및 활성화

```bash
# 설정 파일 복사
sudo cp nginx-cargomon.conf.example /etc/nginx/sites-available/cargomon.conf

# 설정 파일 편집 (필요시 경로 수정)
sudo nano /etc/nginx/sites-available/cargomon.conf

# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/cargomon.conf /etc/nginx/sites-enabled/

# 기본 설정 파일 비활성화 (선택사항)
sudo rm /etc/nginx/sites-enabled/default
```

### 2.2 설정 파일 수정 사항

`/etc/nginx/sites-available/cargomon.conf` 파일에서 다음 경로를 실제 서버 경로에 맞게 수정:

- `root /var/www/cargomon/dist;` → 실제 프론트엔드 빌드 파일 경로
- SSL 인증서 경로는 certbot이 자동으로 설정하지만, 수동으로 설정한 경우 경로 확인

### 2.3 Nginx 설정 테스트 및 재시작

```bash
# 설정 파일 문법 검사
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# 상태 확인
sudo systemctl status nginx
```

## 3. 방화벽 설정

```bash
# UFW 사용 시
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status

# 또는 직접 iptables 사용
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

## 4. 백엔드 설정

### 4.1 CORS 설정

백엔드 `.env` 파일에 HTTPS 도메인 추가:

```env
FRONTEND_ORIGINS=https://cargomon.kr,https://www.cargomon.kr
```

### 4.2 백엔드 실행

```bash
cd backend
source venv/bin/activate
uvicorn 17web:app --host 0.0.0.0 --port 8000
```

## 5. 프론트엔드 빌드 및 배포

### 5.1 빌드

```bash
cd customs-frontend
npm install
npm run build
```

### 5.2 배포

빌드된 `dist` 폴더를 nginx 설정에서 지정한 경로로 복사:

```bash
sudo cp -r dist/* /var/www/cargomon/dist/
sudo chown -R www-data:www-data /var/www/cargomon/dist
```

## 6. HTTPS 연결 확인

### 6.1 브라우저에서 확인

1. `http://cargomon.kr` 접속 → 자동으로 `https://cargomon.kr`로 리다이렉트되는지 확인
2. 브라우저 주소창에 자물쇠 아이콘이 표시되는지 확인
3. 개발자 도구(F12) → Network 탭에서 모든 요청이 HTTPS로 가는지 확인

### 6.2 SSL 테스트

```bash
# SSL Labs 테스트
# https://www.ssllabs.com/ssltest/analyze.html?d=cargomon.kr

# 명령줄 테스트
openssl s_client -connect cargomon.kr:443 -servername cargomon.kr
```

## 7. 문제 해결

### HTTP로만 연결되는 경우 체크리스트

1. ✅ **Nginx 설정 확인**
   - HTTP → HTTPS 리다이렉트가 설정되어 있는지 확인
   - SSL 인증서 경로가 올바른지 확인
   - `sudo nginx -t`로 설정 파일 문법 확인

2. ✅ **SSL 인증서 확인**
   ```bash
   sudo certbot certificates
   sudo ls -la /etc/letsencrypt/live/cargomon.kr/
   ```

3. ✅ **포트 확인**
   ```bash
   sudo netstat -tlnp | grep :443
   sudo netstat -tlnp | grep :80
   ```

4. ✅ **방화벽 확인**
   ```bash
   sudo ufw status
   sudo iptables -L -n | grep 443
   ```

5. ✅ **DNS 확인**
   - DNS A 레코드가 올바른지 확인
   - `dig cargomon.kr` 또는 `nslookup cargomon.kr`로 확인

6. ✅ **브라우저 캐시 삭제**
   - 브라우저 캐시 및 쿠키 삭제 후 재시도

7. ✅ **프론트엔드 빌드 확인**
   - 프로덕션 모드로 빌드되었는지 확인 (`npm run build`)
   - 환경 변수가 올바르게 설정되었는지 확인

## 8. 자동 갱신 설정

Let's Encrypt 인증서는 90일마다 갱신해야 합니다. 자동 갱신 설정:

```bash
# Certbot 타이머 확인
sudo systemctl status certbot.timer

# 수동 갱신 테스트
sudo certbot renew --dry-run
```

## 9. 추가 보안 설정 (선택사항)

### 9.1 HSTS (HTTP Strict Transport Security)

nginx 설정에 이미 포함되어 있습니다:
```
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 9.2 보안 헤더

nginx 설정 파일에 이미 포함되어 있습니다:
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection

## 참고 자료

- [Let's Encrypt 공식 문서](https://letsencrypt.org/docs/)
- [Certbot 공식 문서](https://certbot.eff.org/)
- [Nginx SSL 설정 가이드](https://nginx.org/en/docs/http/configuring_https_servers.html)


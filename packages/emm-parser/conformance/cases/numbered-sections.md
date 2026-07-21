## Prompt:
1\. 2대의 Rocky Linux 9.2 서버에 각 각 서버에 아래와 같이 서버 설치 절차를 명령어와 함께 자세히 설명해줘.

\- WEB 서버 : Apache 설치 및 구성

\- WAS & DB서버 : Tomcat 설치 및 구성, Maria DB 설치 및 구성

2. Apache 서버와 Tomcat 서버 연동 구성 절차를 자세히 설명해줘

## Response:
네, 물론입니다. Rocky Linux 9.2 서버에 웹서버(Apache), WAS(Tomcat), 데이터베이스(MariaDB)를 설치하고 구성하는 방법을 상세히 설명드리겠습니다.

1. WEB 서버 - Apache 설치 및 구성

```bash
# Apache 설치
sudo dnf install httpd

# Apache 서비스 시작
sudo systemctl start httpd

# Apache 서비스가 부팅 시 자동으로 시작되도록 설정
sudo systemctl enable httpd

# Apache 기본 웹페이지 확인 (서버 IP로 접속)
```

Apache 설정 파일 수정 (`/etc/httpd/conf/httpd.conf`)

* DocumentRoot: 웹 문서 루트 디렉터리 설정
* DirectoryIndex: 기본 웹 페이지 파일명 설정

2. WAS & DB서버 - Tomcat 설치 및 구성

```bash
# Java 설치 (Tomcat에 필요)
sudo dnf install java-11-openjdk

# Tomcat 다운로드 및 압축 해제
wget https://dlcdn.apache.org/tomcat/tomcat-9/v9.0.71/bin/apache-tomcat-9.0.71.tar.gz
tar xvzf apache-tomcat-9.0.71.tar.gz

# Tomcat 시작
cd apache-tomcat-9.0.71/bin
./startup.sh

# Tomcat 웹 관리자 페이지 확인 (서버 IP:8080으로 접속)
```

Tomcat 설정

* `conf/server.xml`: 포트 번호, 접속 IP 등 설정
* `conf/web.xml`: 웹 애플리케이션 기본 설정

3. MariaDB 설치 및 구성

```bash
# MariaDB 저장소 추가
sudo dnf install -y dnf-utils
sudo dnf config-manager --add-repo=https://r.mariadb.com/mariadb-main.repo

# MariaDB 서버 설치
sudo dnf install mariadb-server

# MariaDB 서비스 시작 및 활성화
sudo systemctl start mariadb
sudo systemctl enable mariadb

# MariaDB 보안 설정
sudo mysql_secure_installation
```

MariaDB 설정

* 루트 비밀번호 설정
* 데이터베이스, 사용자 생성 및 권한 부여

4. Apache와 Tomcat 연동 구성

Apache에서 Tomcat으로 요청을 전달하기 위해 mod\_jk 커넥터와 worker.properties 파일을 설정해야 합니다.

```bash
# mod_jk 커넥터 설치
sudo dnf install tomcat-connectors-webapp-tracker

# worker.properties 파일 생성 및 편집
sudo vi /etc/httpd/conf.d/worker.properties
```

worker.properties 파일 내용:

```
worker.list=worker1
worker.worker1.port=8009
worker.worker1.host=localhost
worker.worker1.type=ajp13
```

`/etc/httpd/conf/httpd.conf` 파일에 다음 내용 추가:

```
LoadModule jk_module modules/mod_jk.so

JkWorkersFile /etc/httpd/conf.d/worker.properties
JkLogFile /var/log/httpd/mod_jk.log
JkMount /* worker1
```

Apache와 Tomcat 서비스 재시작:

```bash
sudo systemctl restart httpd
sudo /path/to/tomcat/bin/shutdown.sh
sudo /path/to/tomcat/bin/startup.sh
```

이제 Apache 웹 서버에서 Tomcat 웹 애플리케이션에 접근할 수 있습니다.

위 과정을 통해 Rocky Linux 9.2 서버에 웹서버, WAS, 데이터베이스를 설치하고 Apache와 Tomcat을 연동할 수 있습니다. 필요에 따라 추가적인 보안 설정이나 최적화 작업을 진행하시면 됩니다.

## Prompt:
Apache 웹 서버에서 Tomcat 웹 애플리케이션에 접근 설정을 web 서버에 작업내용과 was 서버 에서의 작업 내용을 구분하여 자세히 설명해줘

## Response:
네, Apache 웹 서버에서 Tomcat 웹 애플리케이션에 접근하기 위한 설정을 웹 서버와 WAS 서버에서 각각 해야 하는 작업을 구분하여 자세히 설명드리겠습니다.

**웹 서버(Apache) 작업**

1. `mod_jk` 커넥터 설치

```bash
sudo dnf install tomcat-connectors-webapp-tracker
```

2. `worker.properties` 파일 생성 및 편집

```bash
sudo vi /etc/httpd/conf.d/worker.properties
```

파일 내용:

```
worker.list=worker1
worker.worker1.port=8009
worker.worker1.host=localhost
worker.worker1.type=ajp13
```

3. Apache 설정 파일(`/etc/httpd/conf/httpd.conf`) 수정

```
LoadModule jk_module modules/mod_jk.so

JkWorkersFile /etc/httpd/conf.d/worker.properties
JkLogFile /var/log/httpd/mod_jk.log
JkMount /* worker1
```

4. Apache 서비스 재시작

```bash
sudo systemctl restart httpd
```

**WAS 서버(Tomcat) 작업**

1. Tomcat 설정 파일(`/path/to/tomcat/conf/server.xml`) 수정

`<Connector>` 태그 안에 다음 내용 추가:

```xml
<Connector port="8009" protocol="AJP/1.3" redirectPort="8443" />
```

2. Tomcat 서비스 재시작

```bash
sudo /path/to/tomcat/bin/shutdown.sh
sudo /path/to/tomcat/bin/startup.sh
```

이렇게 웹 서버와 WAS 서버에서 각각 설정을 완료하면 Apache 웹 서버에서 Tomcat 웹 애플리케이션에 접근할 수 있습니다.

**웹 서버(Apache) 작업 설명**

1. `mod_jk` 커넥터를 설치합니다. 이 커넥터를 통해 Apache와 Tomcat 간의 통신이 이루어집니다.
2. `worker.properties` 파일을 생성하고 Tomcat 워커(Worker) 정보를 설정합니다. 이 파일에는 Tomcat 서버의 IP, 포트 번호, 통신 프로토콜 등의 정보가 포함됩니다.
3. Apache 설정 파일에 `mod_jk` 모듈을 로드하고, `worker.properties` 파일 경로와 로그 파일 경로를 지정합니다. 또한 `JkMount` 지시어를 사용하여 Apache에서 Tomcat으로 요청을 전달할 URL 패턴을 설정합니다.
4. Apache 서비스를 재시작하여 변경 사항을 적용합니다.

**WAS 서버(Tomcat) 작업 설명**

1. Tomcat 설정 파일(`server.xml`)에서 `<Connector>` 태그 안에 AJP(Apache JServ Protocol) 커넥터를 추가합니다. 이 커넥터를 통해 Apache와 Tomcat 간의 통신이 이루어집니다. `port` 속성은 `worker.properties` 파일의 포트 번호와 일치해야 합니다.
2. Tomcat 서비스를 재시작하여 변경 사항을 적용합니다.

이렇게 웹 서버와 WAS 서버에서 각각 설정을 완료하면, Apache 웹 서버에서 Tomcat 웹 애플리케이션에 접근할 수 있습니다. 웹 브라우저에서 Apache 웹 서버의 IP 주소 또는 도메인으로 접속하면 Tomcat에 배포된 웹 애플리케이션이 실행됩니다.

## Prompt:
web 서버에 document root 디렉토리 설정 및 WEB 서버 리소스들이 was 서버를 타지 않고 WEB 서버의 document root 디렉토리에 있는 static 페이지 정보를 읽어 서비스 하기 위한 설정을 자세히 알려줘

## Response:
네, 웹 서버(Apache)의 DocumentRoot 디렉터리를 설정하고, 정적 웹 페이지(HTML, CSS, 이미지 등)를 해당 디렉터리에 위치시켜 WAS(Tomcat) 서버를 거치지 않고 바로 서비스하는 방법을 자세히 설명드리겠습니다.

1. **DocumentRoot 디렉터리 설정**

Apache 설정 파일(`/etc/httpd/conf/httpd.conf`)을 열고 `DocumentRoot` 지시어를 찾아 원하는 디렉터리 경로로 변경합니다.

```
DocumentRoot "/var/www/html"
```

위 예시에서는 `/var/www/html`을 DocumentRoot로 설정했습니다. 이 디렉터리에 정적 웹 페이지 파일들을 두면 됩니다.

2. **디렉터리 권한 설정**

DocumentRoot 디렉터리와 그 하위 디렉터리에 대한 올바른 권한을 설정해야 합니다.

```bash
sudo chown -R apache:apache /var/www/html
sudo chmod -R 755 /var/www/html
```

위 명령어는 `/var/www/html` 디렉터리와 하위 파일/디렉터리의 소유자를 `apache` 사용자와 그룹으로 변경하고, 읽기/실행 권한을 부여합니다.

3. **Apache 재시작**

변경 사항을 적용하려면 Apache 서비스를 재시작해야 합니다.

```bash
sudo systemctl restart httpd
```

4. **URL 매핑 설정**

이제 웹 브라우저에서 `http://서버IP/` 또는 `http://서버IP/index.html`과 같은 URL로 접속하면 DocumentRoot 디렉터리에 있는 파일이 직접 서비스됩니다.

5. **정적 리소스와 동적 리소스 분리**

정적 웹 페이지(HTML, CSS, 이미지 등)는 DocumentRoot 디렉터리에 두고, 동적 웹 애플리케이션은 Tomcat 서버에 배포하여 분리합니다. 이렇게 하면 정적 리소스는 Apache 웹 서버에서 직접 서비스되고, 동적 리소스는 Tomcat으로 전달되어 처리됩니다.

Apache 설정 파일에서 `JkMount` 지시어를 사용하여 URL 패턴에 따라 요청을 Tomcat으로 전달할지 여부를 결정할 수 있습니다.

```
JkMount /*.jsp worker1
JkMount /app/* worker1
```

위 예시에서는 `.jsp` 파일과 `/app/` 경로 하위의 요청만 Tomcat으로 전달되고, 나머지 요청은 Apache에서 처리됩니다.

이렇게 설정하면 웹 서버(Apache)는 정적 웹 페이지를 직접 서비스하고, 동적 웹 애플리케이션 요청만 WAS(Tomcat) 서버로 전달하여 처리합니다. 이를 통해 웹 서버와 WAS 서버의 역할을 적절히 분리하고 성능을 향상시킬 수 있습니다.

## Prompt:
1. 전자정부 표준프레임워크(Spring 기반)를 이용하여 개발하고 있다.
2. eclipse 를 사용하고 있다.
3. 현재는 WEB/WAS 분리 되어 있지 않아 war 파일만 WEB/WAS 서버에 ftp로 올려 배포하고 있다.

---

WEB/ WAS 분리후에는

\-WEB 서버에는 어떤 파일들을 어떤 디렉토리에 넣어면 되는지 자세히 알려줘

\-WAS 서버에는 어떤 파일들을 어떤 디렉토리에 넣어면 되는지 자세히 알려줘

## Response:
전자정부 표준프레임워크를 Spring 기반으로 개발하고 있다면, WEB/WAS 분리 후에 다음과 같이 파일들을 배치하는 것이 일반적입니다.

**WEB 서버(Apache)에 배치할 파일**

웹 서버에는 주로 정적 컨텐츠(HTML, CSS, 이미지, JavaScript 등)를 배치합니다. 이를 위해 Apache의 DocumentRoot 디렉터리에 다음과 같이 파일을 배치할 수 있습니다.

```
/var/www/html/
├── css/
│   └── style.css
├── images/
│   └── logo.png
├── js/
│   └── script.js
└── index.html
```

* `/var/www/html/` : Apache의 기본 DocumentRoot 디렉터리
* `css/` : CSS 파일들을 저장할 디렉터리
* `images/` : 이미지 파일들을 저장할 디렉터리
* `js/` : JavaScript 파일들을 저장할 디렉터리
* `index.html` : 웹 사이트의 메인 HTML 파일

**WAS 서버(Tomcat)에 배치할 파일**

WAS 서버에는 웹 애플리케이션의 동적 컨텐츠를 처리하는 파일들을 배치합니다. Spring 기반 애플리케이션의 경우, 다음과 같이 배치할 수 있습니다.

```
/path/to/tomcat/webapps/myapp/
├── WEB-INF/
│   ├── classes/
│   │   └── ... (컴파일된 자바 클래스 파일들)
│   ├── lib/
│   │   └── ... (종속 라이브러리 jar 파일들)
│   ├── spring/
│   │   └── ... (Spring 설정 파일들, xml 또는 자바 config)
│   └── web.xml (웹 애플리케이션 설정 파일)
└── views/
    ├── home.jsp
    ├── user/
    │   └── list.jsp
    └── ...
```

* `/path/to/tomcat/webapps/myapp/` : 웹 애플리케이션의 루트 디렉터리
* `WEB-INF/classes/` : 컴파일된 자바 클래스 파일들을 저장할 디렉터리
* `WEB-INF/lib/` : 웹 애플리케이션에 필요한 외부 라이브러리 jar 파일들을 저장할 디렉터리
* `WEB-INF/spring/` : Spring 설정 파일들을 저장할 디렉터리
* `WEB-INF/web.xml` : 웹 애플리케이션의 설정 파일
* `views/` : JSP 파일들을 저장할 디렉터리

이렇게 분리하면 웹 서버(Apache)는 정적 컨텐츠를 직접 제공하고, 동적 컨텐츠 요청은 WAS 서버(Tomcat)로 전달되어 처리됩니다. 이를 통해 웹 서버와 WAS 서버의 역할을 명확히 분리하고 성능을 향상시킬 수 있습니다.

Eclipse에서 개발한 프로젝트를 빌드(WAR 파일 생성)한 후, 생성된 WAR 파일을 Tomcat의 webapps 디렉터리에 복사하면 됩니다. 그러면 Tomcat이 자동으로 WAR 파일을 해제하고 애플리케이션을 배포합니다.


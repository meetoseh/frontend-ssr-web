#!/usr/bin/env bash
install_basic_dependencies() {
    if ! rsync --help > /dev/null 2>&1
    then
        yum install -y rsync
    fi
}

activate_nvm() {
    source /root/.bashrc
    source /root/.nvm/nvm.sh
}

install_nvm() {
    yum -y install build-essential libssl-dev
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
}

install_node() {
    nvm install 18.18
}

activate_node_installing_if_necessary() {
    activate_nvm
    if ! command -v nvm > /dev/null 2>&1
    then
        install_nvm
        activate_nvm
    fi
    
    if ! command -v npm > /dev/null 2>&1
    then
        install_node
        activate_nvm
    fi
}

install_deployment_dependencies() {
    cd deployment
    if [ ! -d venv ]
    then
        python3 -m venv venv
    fi
    source venv/bin/activate
    python -m pip install -U pip
    pip install --no-deps -r requirements.txt
    deactivate
    cd ..
}

download_build() {
    rm -rf build
    rm -rf tmp
    rm -f build.tar.gz
    
    if ! aws s3 cp s3://$OSEH_S3_BUCKET_NAME/builds/frontend-ssr/build.tar.gz build.tar.gz
    then
        return 1
    fi
    
    tar -xzf build.tar.gz
}

rebuild() {
    source /home/ec2-user/config.sh
    npx webpack --config webpack.config.js --color 2>&1 | tee /home/ec2-user/webpack-server.log
    node --enable-source-maps build/server/server.bundle.js --no-serve --color 2>&1 | tee /home/ec2-user/build-server.log
}

download_build_or_rebuild() {
    if ! download_build
    then
        echo 'Performing local build as no build is available, may take a while...'
        rebuild
    fi
}

install_basic_dependencies
activate_node_installing_if_necessary
npm ci
install_deployment_dependencies
download_build_or_rebuild

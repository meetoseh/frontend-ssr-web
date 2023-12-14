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

rebuild() {
    source /home/ec2-user/config.sh
    npx webpack --config webpack.config.js
    npx ts-node --experimental-specifier-resolution=node --esm build/server/server.bundle.js --no-serve
}

install_basic_dependencies
activate_node_installing_if_necessary
npm ci
rebuild

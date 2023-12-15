# publishes the updates:frontend-ssr-web:build_ready message on redis. In theory we could
# do this with the redis-cli, but it's easier to do it in python
inform_instances() {
    cd /usr/local/src/webapp
    if [ ! -d deployment/venv ]
    then
        cd deployment
        python3 -m venv venv
        cd ..
    fi
    . deployment/venv/bin/activate
    . /home/ec2-user/config.sh
    
    python -m pip install -U pip
    pip install --no-deps -r deployment/requirements.txt
    python -m deployment.on_build_ready
}

inform_instances
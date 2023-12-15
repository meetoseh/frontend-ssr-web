wait_internet() {
    while ! curl google.com >> /dev/null
    do
        sleep 5
    done
}

install_basic_dependencies() {
    yum update -y
    echo 'Installing jq/screen/wget...'
    yum install -y jq screen wget
    echo 'Installing git...'
    yum install -y git
}

verify_iam_profile() {
    curl http://169.254.169.254/latest/meta-data/iam/info | jq -e .InstanceProfileId
    return $?
}

wait_iam_profile() {
    local ctr="0"
    while ! verify_iam_profile
    do
        ctr=$(($ctr + 1))
        echo "initialization failed to verify iam profile (ctr=$ctr)" >> /home/ec2-user/boot_warnings
        sleep 30
        
        if (($ctr > 5))
        then
            echo "iam profile never arrived, giving up on it" >> /home/ec2-user/boot_warnings
            break
        fi
    done
}

wait_internet
install_basic_dependencies
wait_iam_profile

# compresses build/ and tmp/ to build.tar.gz (tmp is optional)
compress_code() {
    cd /usr/local/src/webapp
    tar -czf build.tar.gz build tmp
}

# stores build.tar.gz in S3 under s3_files/builds/frontend-ssr/build.tar.gz
upload_code() {
    . /home/ec2-user/config.sh
    cd /usr/local/src/webapp
    aws s3 cp build.tar.gz s3://$OSEH_S3_BUCKET_NAME/builds/frontend-ssr/build.tar.gz
}

compress_code
upload_code
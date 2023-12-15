echo Starting build.. 1>&2
echo Waiting for boot finished..
bash wait_boot_finished.sh
echo Cloning repo..
bash clone_repo.sh
echo Building website code..
bash build_website_code.sh
echo Compressing and storing code..
bash compress_and_store_code.sh
echo Informing instances..
bash inform_instances.sh
echo All done!